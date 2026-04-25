/**
 * protractor.js — SVG geometry and indicator rendering.
 *
 * Coordinate system:
 *   SVG origin top-left, y increases downward.
 *   Vertex (pivot) at CX=280, CY=390 (center of arc baseline).
 *   Radius R=270. Arc spans 0°–180° (full semicircle, left to right).
 *
 * Indicator angle (indicatorAngle in state):
 *   Measured counterclockwise from the RIGHT horizontal in standard math coords.
 *   0       = far right, 0/12 pitch
 *   π/4     = 12/12 pitch, right side
 *   π/2     = vertical, infinite pitch  → displays ">24/12"
 *   3π/4    = 12/12 pitch, left side
 *   π       = far left, 0/12 pitch
 *
 * SVG arc point for angle θ:
 *   x = CX + R · cos(θ)
 *   y = CY − R · sin(θ)   (minus because SVG y increases downward)
 */

export const CX = 280;
export const CY = 390;
export const R  = 270;

// Default starting angle: 6/12 pitch on the right side
export const DEFAULT_ANGLE = Math.atan(6 / 12); // ≈ 0.4636 rad

/** Convert a pitch/12 value to the angle used in the SVG (rad from right horizontal). */
export function pitchToAngle(pitch) {
  return Math.atan(Math.abs(pitch) / 12);
}

/**
 * Update the indicator line and handle.
 * @param {number} angle  Full semicircle angle in [0, π] rad.
 *                        0=right horizontal, π/2=vertical, π=left horizontal.
 */
export function updateIndicator(angle) {
  const x = CX + R * Math.cos(angle);
  const y = CY - R * Math.sin(angle);

  document.getElementById('indicator-line')
    .setAttribute('x2', x.toFixed(2));
  document.getElementById('indicator-line')
    .setAttribute('y2', y.toFixed(2));

  document.getElementById('indicator-handle')
    .setAttribute('cx', x.toFixed(2));
  document.getElementById('indicator-handle')
    .setAttribute('cy', y.toFixed(2));
}

/**
 * Update the readout for a given indicator angle.
 * Pitch = tan(angle from nearest horizontal) × 12.
 * Shows ">24/12" when pitch exceeds 24.
 */
export function updateReadout(angle) {
  // Angle from the nearest horizontal (right or left side)
  const fromHoriz = angle <= Math.PI / 2 ? angle : Math.PI - angle;
  const pitch = Math.tan(fromHoriz) * 12;
  document.getElementById('readout-value').textContent =
    pitch > 24 ? '>24/12' : pitch.toFixed(1) + '/12';
}

/** Set the fill opacity of the arc (0–1). Outline, ticks, and readout stay opaque. */
export function setArcOpacity(fraction) {
  document.getElementById('arc-fill')
    .setAttribute('fill-opacity', fraction.toFixed(3));
}

/** Rotate the entire protractor group around the vertex. degrees ∈ [−15, 15]. */
export function setProtractorRotation(degrees) {
  document.getElementById('protractor-group')
    .setAttribute('transform', `rotate(${degrees.toFixed(2)},${CX},${CY})`);
}
