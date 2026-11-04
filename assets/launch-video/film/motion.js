// Closed-form springs. Pure functions of time, so seek(t) stays deterministic.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k);
  const z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

export const SPRING = {
  snappy: [320, 30],
  default: [170, 26],
  heavy: [90, 22],
  playful: [220, 14],
};

/** A value with many targets: one spring per change, never a restart. keys: [[time, value], ...] */
export function track(t, keys, k = 170, d = 26) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}
