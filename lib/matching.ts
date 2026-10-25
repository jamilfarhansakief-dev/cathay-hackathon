// lib/matching.ts

export type PassengerProfile = {
  id: string;
  name: string;

  q1?: string | null;
  q2?: string | null;
  q3?: string | string[] | null;
  q4?: string | string[] | null;
  q5?: string | null;
  q6?: string | null;
  q7?: string | null;
  q8?: string | null;
  q9?: string | null;
  q10?: string | null;
};

export type CompatibilityMatch = {
  matched_id: string;
  name: string;
  score: number;
};

export type FlightPassenger = {
  uid: string;
  name: string;
  travellerType?: string;
  connectReasons?: string[];
  personality?: string;
  interests?: string[];
  stayAwake?: string;
  visibility?: {
    travellerType?: boolean;
    connectReasons?: boolean;
    personality?: boolean;
    interests?: boolean;
    stayAwake?: boolean;
  };
};

const isMissing = (val: unknown): boolean => {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (typeof val === "number" && Number.isNaN(val)) return true;
  return false;
};

const normalizeValue = (val: unknown): string | null => {
  if (isMissing(val)) return null;

  if (typeof val === "string") {
    const cleaned = val.trim().toLowerCase();
    if (
      cleaned.includes("prefer not to say") ||
      cleaned.includes("prefer_not_to_say")
    ) {
      return "prefer_not_to_say";
    }
    return cleaned;
  }

  return String(val).trim().toLowerCase();
};

const compareValues = (
  v1: unknown,
  v2: unknown,
  matchScore = 1.0,
  mismatchScore = 0.5
): number => {
  const nv1 = normalizeValue(v1);
  const nv2 = normalizeValue(v2);

  if (nv1 === null || nv2 === null) return 0.3;
  if (nv1 === "prefer_not_to_say" && nv2 === "prefer_not_to_say") return 0.5;
  if (nv1 === "prefer_not_to_say" || nv2 === "prefer_not_to_say") return 0.2;

  return nv1 === nv2 ? matchScore : mismatchScore;
};

const normalizeHobbies = (q3: unknown, q4: unknown): Set<string> => {
  const values: unknown[] = [];

  if (Array.isArray(q3)) values.push(...q3);
  else if (!isMissing(q3)) values.push(q3);

  if (Array.isArray(q4)) values.push(...q4);
  else if (!isMissing(q4)) values.push(q4);

  const hobbies = new Set<string>();

  for (const item of values) {
    const normalized = normalizeValue(item);
    if (!normalized || normalized === "prefer_not_to_say") continue;
    hobbies.add(normalized.trim().toLowerCase());
  }

  return hobbies;
};

const calculateJaccard = (p1: PassengerProfile, p2: PassengerProfile): number => {
  const setA = normalizeHobbies(p1.q3, p1.q4);
  const setB = normalizeHobbies(p2.q3, p2.q4);

  if (setA.size === 0 && setB.size === 0) return 0.5;

  const union = new Set<string>([...setA, ...setB]);
  if (union.size === 0) return 0;

  const overlap = [...setA].filter((value) => setB.has(value)).length;
  return overlap / union.size;
};

const calculateSeatLocation = (loc1: unknown, loc2: unknown): number => {
  const n1 = normalizeValue(loc1);
  const n2 = normalizeValue(loc2);

  if (n1 === null || n2 === null) return 0.3;
  if (n1 === "prefer_not_to_say" && n2 === "prefer_not_to_say") return 0.5;
  if (n1 === "prefer_not_to_say" || n2 === "prefer_not_to_say") return 0.2;

  const s1 = String(n1).trim();
  const s2 = String(n2).trim();

  if (
    s1.includes("no preference") ||
    s2.includes("no preference") ||
    s1.includes("any") ||
    s2.includes("any")
  ) {
    return 0.8;
  }

  if (s1 === s2) return 0.0;

  const validComplementaryPairs = new Set([
    "window-middle",
    "middle-window",
    "window-aisle",
    "aisle-window",
    "middle-aisle",
    "aisle-middle",
  ]);

  if (
    validComplementaryPairs.has(`${s1}-${s2}`) ||
    validComplementaryPairs.has(`${s2}-${s1}`)
  ) {
    return 1.0;
  }

  return 0.4;
};

export function calculateCompatibility(
  p1: PassengerProfile,
  p2: PassengerProfile
): number {
  const purposeScore =
    (compareValues(p1.q1, p2.q1, 1.0, 0.3) +
      compareValues(p1.q2, p2.q2, 1.0, 0.5)) /
    2;

  const hobbiesScore = calculateJaccard(p1, p2);

  const identityScore =
    (compareValues(p1.q5, p2.q5, 1.0, 0.6) +
      compareValues(p1.q6, p2.q6, 1.0, 0.5)) /
    2;

  const vibeScore =
    (compareValues(p1.q7, p2.q7, 1.0, 0.5) +
      compareValues(p1.q8, p2.q8, 1.0, 0.6)) /
    2;

  const seatScore =
    (calculateSeatLocation(p1.q9, p2.q9) +
      compareValues(p1.q10, p2.q10, 1.0, 0.6)) /
    2;

  const finalScore =
    0.25 * purposeScore +
    0.25 * hobbiesScore +
    0.25 * identityScore +
    0.15 * vibeScore +
    0.1 * seatScore;

  return Number((finalScore * 100).toFixed(1));
}

export function generateRankings(
  passengers: PassengerProfile[],
  targetId: string
): CompatibilityMatch[] {
  const target = passengers.find((passenger) => passenger.id === targetId);
  if (!target) return [];

  return passengers
    .filter((passenger) => passenger.id !== targetId)
    .map((passenger) => ({
      matched_id: passenger.id,
      name: passenger.name,
      score: calculateCompatibility(target, passenger),
    }))
    .sort((a, b) => b.score - a.score);
}

export function buildPassengerProfileFromFlightPassenger(
  passenger: FlightPassenger
): PassengerProfile {
  const connectReasons = passenger.connectReasons ?? [];
  const interests = passenger.interests ?? [];
  const travellerType = passenger.travellerType ?? "No preference";
  const personality = passenger.personality ?? "No preference";
  const stayAwake = passenger.stayAwake ?? "No preference";

  return {
    id: passenger.uid,
    name: passenger.name,
    q1: connectReasons.length > 0 ? connectReasons.join(", ") : null,
    q2: personality,
    q3: interests.length > 0 ? interests : null,
    q4: interests.length > 0 ? interests : null,
    q5: travellerType,
    q6: travellerType,
    q7: personality,
    q8: stayAwake,
    q9: "no preference",
    q10: stayAwake,
  };
}

export function generateMatchRankingsForUser(
  passengers: FlightPassenger[],
  currentUserUid: string
): CompatibilityMatch[] {
  const currentPassenger = passengers.find((p) => p.uid === currentUserUid);
  if (!currentPassenger) return [];

  const currentProfile = buildPassengerProfileFromFlightPassenger(currentPassenger);

  return passengers
    .filter((p) => p.uid !== currentUserUid)
    .map((passenger) => {
      const profile = buildPassengerProfileFromFlightPassenger(passenger);
      return {
        matched_id: passenger.uid,
        name: passenger.name,
        score: calculateCompatibility(currentProfile, profile),
      };
    })
    .sort((a, b) => b.score - a.score);
}
