// Regenerates every raster brand asset from the wave-orb mark geometry
// (design handoff "River App Icon — Wave Orb (20d)"). Colors come from
// src/constants/colorways.ts — the same source RiverMark renders from — so
// icons, splash, and the in-app logo can never drift apart.
//
// Run: bun scripts/generate-brand-assets.ts
//
// Outputs:
//   assets/icons/<colorway>.png            1024² full-bleed app icons (9)
//   assets/images/icon.png                 river icon (expo main icon)
//   assets/images/splash-logo.png          mark on transparent, 1024²
//   assets/images/favicon.png              mark on transparent, 48²
//   assets/apple-icon.icon/Assets/splash-logo.png   mark for the liquid-glass icon layer
//   assets/images/android-icon-foreground.png       mark in adaptive safe zone, 512²
//   assets/images/android-icon-background.png       squircle gradient, 512²
//   assets/images/android-icon-monochrome.png       alpha-mask silhouette, 512²

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { type Colorway, colorways } from "../src/constants/colorways";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─── Mark geometry (240×240 canvas, exact per handoff) ─────────

const WAVE_MID = "M 10 108 Q 55 88 100 108 T 190 108 T 280 108 V 230 H 10 Z";
const WAVE_DEEP = "M 10 138 Q 55 118 100 138 T 190 138 T 280 138 V 230 H 10 Z";

function markSvg(c: Colorway, opts: { id?: string } = {}): string {
	const id = opts.id ?? c.name;
	return `
  <defs>
    <clipPath id="orb-${id}"><circle cx="120" cy="120" r="100"/></clipPath>
    <linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.skyTop}"/><stop offset="1" stop-color="${c.skyBot}"/>
    </linearGradient>
    <linearGradient id="sea-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.seaTop}"/><stop offset="1" stop-color="${c.seaBot}"/>
    </linearGradient>
    <radialGradient id="rim-${id}" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0.7" stop-color="${c.squircleBot}" stop-opacity="0"/>
      <stop offset="0.92" stop-color="${c.squircleBot}" stop-opacity="0.2"/>
      <stop offset="1" stop-color="${c.squircleBot}" stop-opacity="0.38"/>
    </radialGradient>
  </defs>
  <circle cx="120" cy="120" r="100" fill="url(#sky-${id})"/>
  <g clip-path="url(#orb-${id})">
    <path d="${WAVE_MID}" fill="url(#sea-${id})"/>
    <path d="${WAVE_DEEP}" fill="${c.deep}"/>
  </g>
  <circle cx="120" cy="120" r="100" fill="url(#rim-${id})"/>
  <ellipse cx="82" cy="62" rx="26" ry="14" fill="#FFFFFF" opacity="0.85" transform="rotate(-24 82 62)"/>`;
}

/** The mark alone on a transparent 240×240 canvas. */
function markOnlySvg(c: Colorway): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${markSvg(c)}</svg>`;
}

/** Full-bleed app icon: squircle gradient + centered mark. The handoff mock
 * used 78% (172/220); shrunk to 70% so the orb breathes more in the squircle.
 * Keep the layer scale in apple-icon.icon/icon.json at this SAME value — the
 * .icon layer uses the same mark-on-240-canvas art, so both scales mean
 * "mark canvas width / icon width". */
function iconSvg(c: Colorway): string {
	const scale = 0.7;
	const offset = (240 * (1 - scale)) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="bg-${c.name}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.squircleTop}"/><stop offset="1" stop-color="${c.squircleBot}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" fill="url(#bg-${c.name})"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${markSvg(c)}</g>
</svg>`;
}

/** Android adaptive foreground: mark inside the 66/108 safe zone. */
function adaptiveForegroundSvg(c: Colorway): string {
	const scale = 66 / 108; // adaptive-icon safe zone
	const offset = (240 * (1 - scale)) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g transform="translate(${offset} ${offset}) scale(${scale})">${markSvg(c)}</g>
</svg>`;
}

function adaptiveBackgroundSvg(c: Colorway): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.squircleTop}"/><stop offset="1" stop-color="${c.squircleBot}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" fill="url(#bg)"/>
</svg>`;
}

/** Monochrome (alpha mask): solid sphere, waves as lighter shading. */
function monochromeSvg(): string {
	const scale = 66 / 108;
	const offset = (240 * (1 - scale)) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <circle cx="120" cy="120" r="100" fill="#FFFFFF" opacity="0.55"/>
    <clipPath id="orb"><circle cx="120" cy="120" r="100"/></clipPath>
    <g clip-path="url(#orb)">
      <path d="${WAVE_MID}" fill="#FFFFFF" opacity="0.8"/>
      <path d="${WAVE_DEEP}" fill="#FFFFFF"/>
    </g>
  </g>
</svg>`;
}

// ─── Render ────────────────────────────────────────────────────

function renderPng(svg: string, size: number, outPath: string) {
	const png = new Resvg(svg, {
		fitTo: { mode: "width", value: size },
	}).render();
	writeFileSync(outPath, png.asPng());
	console.log(`wrote ${outPath} (${size}px)`);
}

const river = colorways.river;
const iconsDir = join(ROOT, "assets/icons");
mkdirSync(iconsDir, { recursive: true });

// Per-colorway app icons (primary + alternates), plus the Android adaptive
// foreground each alternate needs (expo-alternate-app-icons takes a
// foregroundImage + flat backgroundColor per icon).
for (const c of Object.values(colorways)) {
	renderPng(iconSvg(c), 1024, join(iconsDir, `${c.name}.png`));
	renderPng(
		adaptiveForegroundSvg(c),
		1024,
		join(iconsDir, `${c.name}-android-foreground.png`),
	);
}

// Expo main icon = river
renderPng(iconSvg(river), 1024, join(ROOT, "assets/images/icon.png"));

// Splash + favicon + liquid-glass icon layer = bare mark
renderPng(markOnlySvg(river), 1024, join(ROOT, "assets/images/splash-logo.png"));
renderPng(markOnlySvg(river), 48, join(ROOT, "assets/images/favicon.png"));
renderPng(
	markOnlySvg(river),
	1024,
	join(ROOT, "assets/apple-icon.icon/Assets/splash-logo.png"),
);

// Android adaptive icon set
renderPng(
	adaptiveForegroundSvg(river),
	512,
	join(ROOT, "assets/images/android-icon-foreground.png"),
);
renderPng(
	adaptiveBackgroundSvg(river),
	512,
	join(ROOT, "assets/images/android-icon-background.png"),
);
renderPng(
	monochromeSvg(),
	512,
	join(ROOT, "assets/images/android-icon-monochrome.png"),
);

console.log("done");
