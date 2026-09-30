using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

public class SceneManifestExporterWindow : EditorWindow
{
	private string targetFolderName = "ExportedScene";

	[MenuItem("Tools/Export Scene Manifest & GameObject")]
	public static void ShowWindow()
	{
		GetWindow<SceneManifestExporterWindow>("Scene Manifest Exporter");
	}

	private void OnGUI()
	{
		GUILayout.Label("ThirdPersonController Scene Exporter", EditorStyles.boldLabel);
		EditorGUILayout.Space();

		EditorGUILayout.HelpBox(
			"Select a GameObject in the hierarchy. This tool will export the selected GameObject and all its children, " +
			"bundle any associated asset files (.obj, .mtl, textures, etc.) into a target folder, and generate a brand new " +
			"scene-manifest.json file containing the selected GameObject and all its child objects independently added as hierarchical gameObjects.",
			MessageType.Info);

		EditorGUILayout.Space();
		targetFolderName = EditorGUILayout.TextField("Export Folder Name", targetFolderName);

		EditorGUILayout.Space();

		if (GUILayout.Button("Export Selected GameObject & Scene Manifest", GUILayout.Height(40)))
		{
			ExportSelected();
		}
	}

	private void ExportSelected()
	{
		GameObject selectedRoot = Selection.activeGameObject;
		if (selectedRoot == null)
		{
			EditorUtility.DisplayDialog("Error", "Please select a GameObject in the hierarchy first.", "OK");
			return;
		}

		// Prompt user for output directory or default to project root / target folder
		string defaultPath = Path.Combine(Directory.GetCurrentDirectory(), targetFolderName);
		string exportPath = EditorUtility.OpenFolderPanel("Select Export Target Folder", Directory.GetCurrentDirectory(), targetFolderName);

		if (string.IsNullOrEmpty(exportPath))
		{
			return; // Cancelled
		}

		try
		{
			EditorUtility.DisplayProgressBar("Exporting Scene Manifest", "Gathering GameObjects and assets...", 0.2f);

			// Create subdirectories if needed (e.g. models / assets)
			string modelsFolder = Path.Combine(exportPath, "models");
			Directory.CreateDirectory(modelsFolder);

			List<Dictionary<string, object>> exportedGameObjects = new List<Dictionary<string, object>>();

			// Process root and children recursively
			Dictionary<string, object> rootDict = ProcessGameObject(selectedRoot, null, exportPath, modelsFolder);
			exportedGameObjects.Add(rootDict);

			// Build full scene manifest structure
			Dictionary<string, object> manifest = new Dictionary<string, object>();
			manifest["version"] = 2;

			Dictionary<string, object> debugDict = new Dictionary<string, object>();
			debugDict["enabled"] = false;
			manifest["debug"] = debugDict;

			manifest["playerSpawns"] = new List<object> { new List<float> { 0f, 0f, 0f } };

			Dictionary<string, object> sceneDict = new Dictionary<string, object>();
			sceneDict["background"] = "#112233";
			sceneDict["fog"] = "#000000";
			manifest["scene"] = sceneDict;

			manifest["gameObjects"] = new List<object>(exportedGameObjects);

			EditorUtility.DisplayProgressBar("Exporting Scene Manifest", "Writing scene-manifest.json...", 0.8f);

			// Serialize to JSON with formatting
			string jsonOutput = SerializeToJson(manifest, 0);

			string manifestFilePath = Path.Combine(exportPath, "scene-manifest.json");
			File.WriteAllText(manifestFilePath, jsonOutput, Encoding.UTF8);

			EditorUtility.ClearProgressBar();
			EditorUtility.DisplayDialog("Export Successful", $"Successfully exported scene manifest and assets to:\n{exportPath}", "OK");
			AssetDatabase.Refresh();
		}
		catch (Exception ex)
		{
			EditorUtility.ClearProgressBar();
			EditorUtility.DisplayDialog("Export Error", $"An error occurred during export:\n{ex.Message}", "OK");
			Debug.LogError(ex);
		}
	}

	private Dictionary<string, object> ProcessGameObject(GameObject obj, string parentId, string exportPath, string modelsFolder)
	{
		string name = obj.name;
		string id = Slugify(name) + "-" + obj.GetInstanceID();

		Dictionary<string, object> dict = new Dictionary<string, object>();
		dict["id"] = id;
		dict["name"] = name;
		dict["active"] = obj.activeSelf;
		dict["tag"] = obj.tag ?? "Untagged";
		dict["layer"] = obj.layer;
		dict["static"] = obj.isStatic;

		// Transform
		Dictionary<string, object> transform = new Dictionary<string, object>();
		Vector3 pos = obj.transform.localPosition;
		Vector3 rot = obj.transform.localEulerAngles;
		Vector3 scl = obj.transform.localScale;

		transform["position"] = new List<float> { pos.x, pos.y, pos.z };
		transform["rotation"] = new List<float> { rot.x, rot.y, rot.z };
		transform["scale"] = new List<float> { scl.x, scl.y, scl.z };
		dict["transform"] = transform;

		// Components
		List<object> components = new List<object>();

		// Check for Light
		Light light = obj.GetComponent<Light>();
		if (light != null)
		{
			Dictionary<string, object> lightComp = new Dictionary<string, object>();
			lightComp["type"] = "light";
			lightComp["lightType"] = light.type == LightType.Directional ? "directional" :
									light.type == LightType.Point ? "point" :
									light.type == LightType.Spot ? "spot" :
									light.type == LightType.Area ? "hemisphere" : "directional";
			lightComp["color"] = ColorUtility.ToHtmlStringRGB(light.color);
			lightComp["groundColor"] = "#222222";
			lightComp["intensity"] = light.intensity;
			lightComp["distance"] = light.range;
			lightComp["castShadow"] = light.shadows != LightShadows.None;
			components.Add(lightComp);
		}

		// Check for MeshFilter / Renderer (OBJ/Model export or Primitive)
		MeshFilter meshFilter = obj.GetComponent<MeshFilter>();
		MeshRenderer meshRenderer = obj.GetComponent<MeshRenderer>();
		if (meshFilter != null && meshFilter.sharedMesh != null)
		{
			string meshName = meshFilter.sharedMesh.name;
			string modelFileName = Slugify(meshName) + ".obj";
			string modelRelativePath = "models/" + modelFileName;
			string fullModelPath = Path.Combine(modelsFolder, modelFileName);

			// Export mesh to OBJ if not already exported
			if (!File.Exists(fullModelPath))
			{
				ExportMeshToObj(meshFilter.sharedMesh, meshRenderer, fullModelPath);
			}

			Dictionary<string, object> modelComp = new Dictionary<string, object>();
			modelComp["type"] = "model";
			modelComp["modelType"] = "obj";
			modelComp["objPath"] = modelRelativePath;
			modelComp["ignoreCulling"] = false;

			if (meshRenderer != null && meshRenderer.sharedMaterial != null)
			{
				Material mat = meshRenderer.sharedMaterial;
				modelComp["material"] = mat.name;
			}

			components.Add(modelComp);
		}

		dict["components"] = components;

		// Children
		List<Dictionary<string, object>> children = new List<Dictionary<string, object>>();
		foreach (Transform child in obj.transform)
		{
			if (child != null)
			{
				children.Add(ProcessGameObject(child.gameObject, id, exportPath, modelsFolder));
			}
		}
		dict["children"] = children;

		return dict;
	}

	private void ExportMeshToObj(Mesh mesh, MeshRenderer renderer, string filePath)
	{
		StringBuilder sb = new StringBuilder();
		sb.AppendLine("# Exported from Unity for ThirdPersonController");
		sb.AppendLine("g " + mesh.name);

		foreach (Vector3 v in mesh.vertices)
		{
			// Unity coordinates (Left-Handed) to WebGL / Three.js (Right-Handed): flip Z
			sb.AppendLine(string.Format("v {0} {1} {2}", v.x, v.y, -v.z));
		}

		foreach (Vector3 n in mesh.normals)
		{
			sb.AppendLine(string.Format("vn {0} {1} {2}", n.x, n.y, -n.z));
		}

		foreach (Vector2 uv in mesh.uv)
		{
			sb.AppendLine(string.Format("vt {0} {1}", uv.x, uv.y));
		}

		for (int sub = 0; sub < mesh.subMeshCount; sub++)
		{
			int[] triangles = mesh.GetTriangles(sub);
			for (int i = 0; i < triangles.Length; i += 3)
			{
				// Reverse winding order for right-handed coordinate conversion
				int idx1 = triangles[i + 2] + 1;
				int idx2 = triangles[i + 1] + 1;
				int idx3 = triangles[i] + 1;

				sb.AppendLine(string.Format("f {0}/{0}/{0} {1}/{1}/{1} {2}/{2}/{2}", idx1, idx2, idx3));
			}
		}

		File.WriteAllText(filePath, sb.ToString());
	}

	private string Slugify(string text)
	{
		if (string.IsNullOrEmpty(text)) return "game-object";
		string slug = text.ToLowerInvariant();
		char[] chars = slug.ToCharArray();
		StringBuilder sb = new StringBuilder();
		foreach (char c in chars)
		{
			if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))
			{
				sb.Append(c);
			}
			else
			{
				sb.Append('-');
			}
		}
		return sb.ToString().Trim('-');
	}

	private string SerializeToJson(object obj, int indent)
	{
		string indentStr = new string(' ', indent * 2);
		string nextIndentStr = new string(' ', (indent + 1) * 2);

		if (obj == null)
		{
			return "null";
		}
		else if (obj is bool)
		{
			return (bool)obj ? "true" : "false";
		}
		else if (obj is int || obj is float || obj is double || obj is long)
		{
			return Convert.ToString(obj, System.Globalization.CultureInfo.InvariantCulture);
		}
		else if (obj is string)
		{
			return "\"" + EscapeJson((string)obj) + "\"";
		}
		else if (obj is List<object>)
		{
			List<object> list = (List<object>)obj;
			if (list.Count == 0) return "[]";

			StringBuilder sb = new StringBuilder();
			sb.AppendLine("[");
			for (int i = 0; i < list.Count; i++)
			{
				sb.Append(nextIndentStr);
				sb.Append(SerializeToJson(list[i], indent + 1));
				if (i < list.Count - 1) sb.AppendLine(",");
				else sb.AppendLine();
			}
			sb.Append(indentStr + "]");
			return sb.ToString();
		}
		else if (obj is List<float>)
		{
			List<float> list = (List<float>)obj;
			if (list.Count == 0) return "[]";

			StringBuilder sb = new StringBuilder();
			sb.AppendLine("[");
			for (int i = 0; i < list.Count; i++)
			{
				sb.Append(nextIndentStr);
				sb.Append(SerializeToJson(list[i], indent + 1));
				if (i < list.Count - 1) sb.AppendLine(",");
				else sb.AppendLine();
			}
			sb.Append(indentStr + "]");
			return sb.ToString();
		}
		else if (obj is List<Dictionary<string, object>>)
		{
			List<Dictionary<string, object>> list = (List<Dictionary<string, object>>)obj;
			if (list.Count == 0) return "[]";

			StringBuilder sb = new StringBuilder();
			sb.AppendLine("[");
			for (int i = 0; i < list.Count; i++)
			{
				sb.Append(nextIndentStr);
				sb.Append(SerializeToJson(list[i], indent + 1));
				if (i < list.Count - 1) sb.AppendLine(",");
				else sb.AppendLine();
			}
			sb.Append(indentStr + "]");
			return sb.ToString();
		}
		else if (obj is Dictionary<string, object>)
		{
			Dictionary<string, object> dict = (Dictionary<string, object>)obj;
			if (dict.Count == 0) return "{}";

			StringBuilder sb = new StringBuilder();
			sb.AppendLine("{");
			int count = 0;
			foreach (var kvp in dict)
			{
				sb.Append(nextIndentStr);
				sb.Append("\"" + EscapeJson(kvp.Key) + "\": ");
				sb.Append(SerializeToJson(kvp.Value, indent + 1));
				count++;
				if (count < dict.Count) sb.AppendLine(",");
				else sb.AppendLine();
			}
			sb.Append(indentStr + "}");
			return sb.ToString();
		}

		return "\"" + EscapeJson(obj.ToString()) + "\"";
	}

	private string EscapeJson(string str)
	{
		if (string.IsNullOrEmpty(str)) return "";
		return str.Replace("\\", "\\\\")
				  .Replace("\"", "\\\"")
				  .Replace("\n", "\\n")
				  .Replace("\r", "\\r")
				  .Replace("\t", "\\t");
	}
}
