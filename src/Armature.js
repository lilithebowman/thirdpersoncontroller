export class Armature {
  constructor(root = null) {
    this.root = root;
  }

  static canonicalizeNodeName(name) {
    if (typeof name !== 'string' || name.length === 0) {
      return null;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }

    const segments = trimmed.split(/[:|/\\]/).filter(Boolean);
    const base = segments.length > 0 ? segments[segments.length - 1] : trimmed;
    const canonical = base.toLowerCase().replace(/[^a-z0-9]/g, '');
    return canonical || null;
  }

  canonicalizeNodeName(name) {
    return Armature.canonicalizeNodeName(name);
  }

  static normalizeSearchTerms(value) {
    if (value == null) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) => Armature.normalizeSearchTerms(entry));
    }

    if (typeof value === 'object') {
      const terms = [];
      if (typeof value.role === 'string') {
        terms.push(...Armature.normalizeSearchTerms(value.role));
      }
      if (typeof value.side === 'string') {
        terms.push(...Armature.normalizeSearchTerms(value.side));
      }
      if (typeof value.name === 'string') {
        terms.push(...Armature.normalizeSearchTerms(value.name));
      }
      if (Array.isArray(value.aliases)) {
        terms.push(...Armature.normalizeSearchTerms(value.aliases));
      }
      return terms;
    }

    return String(value)
      .toLowerCase()
      .replace(/[._:/\\|\-]+/g, ' ')
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  static inferBoneRole(name) {
    const canonical = Armature.canonicalizeNodeName(name);
    if (!canonical) {
      return null;
    }

    const normalized = canonical.replace(/_/g, '');
    const roleMap = [
      { role: 'hips', keywords: ['hips', 'hip', 'pelvis', 'root', 'rootbone'] },
      { role: 'spine', keywords: ['spine', 'vertebra', 'waist', 'torso'] },
      { role: 'chest', keywords: ['chest', 'breast', 'rib', 'upperchest', 'torso'] },
      { role: 'neck', keywords: ['neck', 'cervical'] },
      { role: 'head', keywords: ['head', 'skull', 'face', 'jaw'] },
      { role: 'upperarm', keywords: ['upperarm', 'shoulder', 'clavicle', 'humerus', 'arm'] },
      { role: 'lowerarm', keywords: ['lowerarm', 'forearm', 'elbow', 'ulna', 'radius'] },
      { role: 'hand', keywords: ['hand', 'wrist', 'palm'] },
      { role: 'upperleg', keywords: ['upperleg', 'upperthigh', 'thigh', 'femur', 'leg'] },
      { role: 'lowerleg', keywords: ['lowerleg', 'shin', 'calf', 'tibia', 'fibula', 'knee', 'leg'] },
      { role: 'foot', keywords: ['foot', 'feet', 'ankle', 'toe'] },
      { role: 'finger', keywords: ['index', 'middle', 'ring', 'pinky', 'thumb', 'finger'] },
    ];

    let bestRole = null;
    let bestScore = 0;

    for (const entry of roleMap) {
      const score = entry.keywords.reduce((total, keyword) => {
        if (!normalized.includes(keyword)) {
          return total;
        }
        return total + keyword.length;
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestRole = entry.role;
      }
    }

    return bestScore > 0 ? bestRole : null;
  }

  inferBoneRole(name) {
    return Armature.inferBoneRole(name);
  }

  static inferBoneSide(name) {
    if (typeof name !== 'string' || name.length === 0) {
      return 'center';
    }

    const raw = name.trim().toLowerCase();
    const canonical = Armature.canonicalizeNodeName(name);
    const normalized = canonical ? canonical.replace(/_/g, '') : raw.replace(/[^a-z0-9]/g, '');

    if (normalized.includes('left') || normalized.includes('lefthand') || normalized.includes('handleft')) {
      return 'left';
    }

    if (normalized.includes('right') || normalized.includes('righthand') || normalized.includes('handright')) {
      return 'right';
    }

    if (normalized.includes('handl')) {
      return 'left';
    }

    if (normalized.includes('handr')) {
      return 'right';
    }

    const suffix = normalized.match(/([lr])$/);
    if (suffix) {
      return suffix[1] === 'l' ? 'left' : 'right';
    }

    const bareSide = raw.match(/(?:^|[^a-z])([lr])(?:$|[^a-z])/);
    if (bareSide) {
      return bareSide[1] === 'l' ? 'left' : 'right';
    }

    return 'center';
  }

  inferBoneSide(name) {
    return Armature.inferBoneSide(name);
  }

  static scoreBoneMatch(name, query, { side } = {}) {
    if (!name || typeof name !== 'string' || !query) {
      return 0;
    }

    const canonical = Armature.canonicalizeNodeName(name);
    if (!canonical) {
      return 0;
    }

    const queryTerms = Armature.normalizeSearchTerms(query);
    if (queryTerms.length === 0) {
      return 0;
    }

    const desiredSide = typeof side === 'string' ? side.toLowerCase() : null;
    const actualSide = Armature.inferBoneSide(name);
    if (desiredSide && desiredSide !== 'any' && desiredSide !== 'center' && actualSide !== desiredSide) {
      return 0;
    }

    if (desiredSide === 'center' && actualSide !== 'center') {
      return 0;
    }

    let score = 0;
    const raw = name.toLowerCase();

    for (const term of queryTerms) {
      if (!term) {
        continue;
      }

      if (canonical === term) {
        score += 50;
      }

      if (canonical.includes(term)) {
        score += 10 + term.length;
      }

      if (raw.includes(term)) {
        score += 4 + term.length;
      }

      const role = Armature.inferBoneRole(name);
      if (role && role === term) {
        score += 30;
      }
    }

    const roleTerms = Armature.normalizeSearchTerms({
      role: typeof query === 'object' && query && typeof query.role === 'string' ? query.role : null,
    });
    if (roleTerms.length > 0) {
      const role = Armature.inferBoneRole(name);
      if (role && roleTerms.includes(role)) {
        score += 40;
      }
    }

    if (desiredSide && desiredSide !== 'any' && actualSide === desiredSide) {
      score += 25;
    }

    if (queryTerms.includes('right') || queryTerms.includes('r')) {
      if (actualSide === 'right') {
        score += 25;
      }
    }

    if (queryTerms.includes('left') || queryTerms.includes('l')) {
      if (actualSide === 'left') {
        score += 25;
      }
    }

    if (canonical.includes('hand') && queryTerms.includes('hand')) {
      score += 15;
    }

    return score;
  }

  static findBone(root, query, options = {}) {
    const source = root || options.root || null;
    if (!source || typeof source.traverse !== 'function') {
      return null;
    }

    let bestBone = null;
    let bestScore = 0;

    source.traverse((child) => {
      if (!child?.isBone || !child?.name) {
        return;
      }

      const score = Armature.scoreBoneMatch(child.name, query, options);
      if (score > bestScore) {
        bestBone = child;
        bestScore = score;
      }
    });

    return bestScore > 0 ? bestBone : null;
  }

  findBone(query, options = {}) {
    return Armature.findBone(this.root, query, options);
  }

  static findRootBone(root) {
    if (!root || typeof root.traverse !== 'function') {
      return null;
    }

    let bestCandidate = null;
    let bestDepth = Number.POSITIVE_INFINITY;
    let bestScore = -1;

    root.traverse((child) => {
      if (!child?.isBone || !child.name) {
        return;
      }

      const role = Armature.inferBoneRole(child.name);
      const depth = Armature.computeBoneDepth(root, child);
      const score = role === 'hips' ? 10 : role === 'chest' ? 6 : role === 'head' ? 2 : 0;

      if (score > bestScore || (score === bestScore && depth < bestDepth)) {
        bestScore = score;
        bestDepth = depth;
        bestCandidate = child;
      }
    });

    return bestCandidate;
  }

  static computeBoneDepth(root, bone) {
    if (!root || !bone || !bone.parent) {
      return 0;
    }

    let depth = 0;
    let current = bone;
    while (current && current !== root) {
      depth += 1;
      current = current.parent;
    }
    return depth;
  }

  static hasHumanoidRig(root) {
    const armature = new Armature(root);
    const skeleton = armature.discover();
    return Object.values(skeleton).filter(Boolean).length >= 12;
  }

  discover(root = this.root) {
    const source = root || this.root;
    if (!source || typeof source.traverse !== 'function') {
      return {};
    }

    const find = (query, options = {}) => Armature.findBone(source, query, options);

    const mapping = {
      hips: find(['hips', 'hip', 'pelvis', 'root']) || find({ role: 'hips' }),
      spine: find(['spine', 'vertebra', 'waist', 'torso']) || find({ role: 'spine' }),
      chest: find(['chest', 'upperchest', 'breast', 'rib']) || find({ role: 'chest' }),
      neck: find(['neck', 'cervical']) || find({ role: 'neck' }),
      head: find(['head', 'skull', 'face', 'jaw']) || find({ role: 'head' }),
      leftUpperArm: find({ role: 'upperarm', side: 'left' }),
      rightUpperArm: find({ role: 'upperarm', side: 'right' }),
      leftLowerArm: find({ role: 'lowerarm', side: 'left' }),
      rightLowerArm: find({ role: 'lowerarm', side: 'right' }),
      leftHand: find({ role: 'hand', side: 'left' }),
      rightHand: find({ role: 'hand', side: 'right' }),
      leftUpperLeg: find({ role: 'upperleg', side: 'left' }),
      rightUpperLeg: find({ role: 'upperleg', side: 'right' }),
      leftLowerLeg: find({ role: 'lowerleg', side: 'left' }),
      rightLowerLeg: find({ role: 'lowerleg', side: 'right' }),
      leftFoot: find({ role: 'foot', side: 'left' }),
      rightFoot: find({ role: 'foot', side: 'right' }),
    };

    return mapping;
  }
}

export default Armature;
