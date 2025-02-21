export function euclideanDistance(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) return 1; // Default high distance if missing

  return Math.sqrt(
    descriptor1.reduce(
      (sum, value, i) => sum + Math.pow(value - descriptor2[i], 2),
      0
    )
  );
}
