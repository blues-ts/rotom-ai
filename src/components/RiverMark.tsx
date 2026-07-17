import Svg, {
	Circle,
	ClipPath,
	Defs,
	Ellipse,
	G,
	LinearGradient,
	Path,
	RadialGradient,
	Stop,
} from "react-native-svg";
import { type ColorwayName, colorways } from "@/constants/colorways";

// The River mark — a glossy water sphere split by two parallel waves.
// Geometry is exact per the "wave orb (20d)" handoff: 240×240 canvas, sphere
// r=100 at center, waves clipped to the sphere, gloss ellipse rotated −24°.
// The two waves are exact parallel copies (+30px) — intentional and
// load-bearing for the mark. No stroke, no monogram.
// One addition beyond the handoff: a radial inner rim shadow (heavier at the
// bottom edge, tinted with the colorway's darkest shade) for sphere depth.
// Keep in sync with markSvg() in scripts/generate-brand-assets.ts.
const WAVE_MID = "M 10 108 Q 55 88 100 108 T 190 108 T 280 108 V 230 H 10 Z";
const WAVE_DEEP = "M 10 138 Q 55 118 100 138 T 190 138 T 280 138 V 230 H 10 Z";

export default function RiverMark({
	size = 120,
	colorway = "river",
}: {
	size?: number;
	colorway?: ColorwayName;
}) {
	const c = colorways[colorway];
	// Gradient/clip ids are global per SVG document on some platforms — key
	// them by colorway so multiple marks (the settings picker) don't collide.
	const skyId = `riverMarkSky-${colorway}`;
	const seaId = `riverMarkSea-${colorway}`;
	const orbId = `riverMarkOrb-${colorway}`;
	const rimId = `riverMarkRim-${colorway}`;
	return (
		<Svg width={size} height={size} viewBox="0 0 240 240">
			<Defs>
				<ClipPath id={orbId}>
					<Circle cx={120} cy={120} r={100} />
				</ClipPath>
				<LinearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
					<Stop offset="0" stopColor={c.skyTop} />
					<Stop offset="1" stopColor={c.skyBot} />
				</LinearGradient>
				<LinearGradient id={seaId} x1="0" y1="0" x2="0" y2="1">
					<Stop offset="0" stopColor={c.seaTop} />
					<Stop offset="1" stopColor={c.seaBot} />
				</LinearGradient>
				<RadialGradient id={rimId} cx="50%" cy="42%" r="60%">
					<Stop offset="0.7" stopColor={c.squircleBot} stopOpacity={0} />
					<Stop offset="0.92" stopColor={c.squircleBot} stopOpacity={0.2} />
					<Stop offset="1" stopColor={c.squircleBot} stopOpacity={0.38} />
				</RadialGradient>
			</Defs>
			<Circle cx={120} cy={120} r={100} fill={`url(#${skyId})`} />
			<G clipPath={`url(#${orbId})`}>
				<Path d={WAVE_MID} fill={`url(#${seaId})`} />
				<Path d={WAVE_DEEP} fill={c.deep} />
			</G>
			<Circle cx={120} cy={120} r={100} fill={`url(#${rimId})`} />
			<Ellipse
				cx={82}
				cy={62}
				rx={26}
				ry={14}
				fill="#FFFFFF"
				opacity={0.85}
				transform="rotate(-24 82 62)"
			/>
		</Svg>
	);
}
