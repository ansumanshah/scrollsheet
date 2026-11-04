import { Sheet } from "scrollsheet";

/**
 * detents={["full"]}: the tallest (only) detent reaches the true viewport
 * edge, so the built-in radius-flatten kicks in near the top of travel, the
 * panel squares off as it meets the screen edge, UISheetPresentationController
 * style, then rounds back on the way down. An article reader is a more
 * realistic backdrop for that transition than a blank panel, but the drag
 * mechanics are untouched.
 */
export default function FullScreenExample() {
  return (
    <Sheet.Root detents={["full"]} themeColorDimming>
      <Sheet.Trigger className="ex-trigger">Open full screen</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Article">
        <Sheet.Handle />
        <div className="ex-article-cover">
          <svg
            viewBox="0 0 800 220"
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label="A jagged mountain ridge under a rising moon at dusk"
          >
            <defs>
              <linearGradient id="ex-article-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#141935" />
                <stop offset="0.55" stopColor="#453a68" />
                <stop offset="1" stopColor="#dd9159" />
              </linearGradient>
            </defs>
            <rect width="800" height="220" fill="url(#ex-article-sky)" />
            <circle cx="640" cy="58" r="22" fill="#f6e7c8" opacity="0.9" />
            <circle cx="90" cy="40" r="1.4" fill="#f6e7c8" opacity="0.7" />
            <circle cx="150" cy="66" r="1" fill="#f6e7c8" opacity="0.5" />
            <circle cx="230" cy="34" r="1.2" fill="#f6e7c8" opacity="0.6" />
            <circle cx="320" cy="52" r="1" fill="#f6e7c8" opacity="0.5" />
            <circle cx="480" cy="30" r="1.4" fill="#f6e7c8" opacity="0.7" />
            <path
              d="M0 150 L60 122 L130 142 L210 100 L290 136 L370 108 L450 140 L540 104 L620 136 L700 112 L800 138 V220 H0 Z"
              fill="#4a4570"
            />
            <path
              d="M0 178 L90 148 L170 170 L250 130 L330 166 L410 138 L500 172 L590 142 L670 168 L750 146 L800 168 V220 H0 Z"
              fill="#332f52"
            />
            <path
              d="M0 206 L70 172 L150 198 L230 158 L310 194 L400 168 L480 202 L560 164 L650 198 L730 176 L800 200 V220 H0 Z"
              fill="#1c1a2e"
            />
          </svg>
        </div>
        <div className="ex-panel-body">
          <Sheet.Title>Learning to read a ridgeline</Sheet.Title>
          <div className="ex-article-byline">
            <span className="ex-avatar">NK</span>
            <div>
              <div className="ex-row-title">Nora Kessler</div>
              <div className="ex-row-sub">2 min read</div>
            </div>
          </div>
          <p>
            I missed a turn on my first hike with a topo map. I had followed the trail but lost
            track of the contour lines. Looking back, the junction sat in a saddle between two
            peaks.
          </p>
          <p>
            A six-mile trail with 2,000 feet of climbing may gain half that height in one mile.
            Closely spaced contour lines show the steep sections; wider gaps show gentler ground.
            I check those sections before choosing a route.
          </p>
          <blockquote className="ex-pull-quote">
            Check the steep sections before you set out.
          </blockquote>
          <p>
            Now I trace the route on the map before checking the distance. I look for steep
            climbs, exposed ridges, and places to turn back. Then I estimate how much time to allow.
          </p>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
