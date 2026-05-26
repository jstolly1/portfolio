// Disco-mode GLSL shaders, ported from sabosugi's CodePen disco-ball pen
// (https://codepen.io/sabosugi/pen/NPbvWLy). The main shader ray-marches a
// faceted disco ball with reflective bounces; the post shader adds god-ray
// volumetric streaks and tonemaps the HDR result.
//
// Both run on a full-viewport quad (vertex shader is trivial). MAX_SAMPLES
// dropped from 10 → 4 vs. the original — the effect is brief (~5s) and the
// reduction keeps the disco affordable on mid-range hardware.

export const discoVertexShader = `
  void main() { gl_Position = vec4(position, 1.0); }
`;

export const discoFragmentShader = `
  uniform float iTime;
  uniform vec2 iResolution;
  uniform float uAutoRotSpeed;
  uniform vec2 uManualRot;
  uniform float uZoom;
  uniform float uRoughness;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uFractalScale;
  uniform float uBgFractalSpeed;
  uniform float uCoreFractalSpeed;
  uniform float uFractalAmp;
  // Ball center and visible radius in framebuffer pixels — set every frame
  // from the bouncing ball's screen position so the disco ball renders at
  // exactly the same on-screen location and size as the original ball.
  uniform vec2 uBallCenter;
  uniform float uBallPixelRadius;

  #define ENABLE_CAMERA_WOBBLE
  #define ENABLE_LENS_BLUR
  #define ENABLE_TEMPORAL_BLUR

  const int MAX_SAMPLES = 10;

  mat2 rot(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat2(c, s, -s, c);
  }

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.2031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  vec3 hash3(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }

  float smoothNoise(vec2 uv) {
    vec2 cell = floor(uv);
    vec2 local = fract(uv);
    vec2 curve = local * local * (3.9 - 2.1 * local);
    float b00 = hash(cell + vec2(-0.1, 0.0));
    float b10 = hash(cell + vec2(-0.1, 0.0));
    float b01 = hash(cell + vec2(-0.1, 1.0));
    float b11 = hash(cell + vec2(0.8, 1.0));
    return mix(mix(b00, b10, curve.x), mix(b01, b11, curve.x), curve.y);
  }

  float fractalNoise(vec2 uv) {
    float outputVal = 0.0;
    float amplitude = uFractalAmp;
    mat2 transform = mat2(1.6, 1.2, -1.2, 1.7);
    for (int i = 0; i < 5; i++) {
      outputVal += amplitude * smoothNoise(uv);
      uv = transform * uv;
      amplitude *= 0.4;
    }
    return outputVal;
  }

  float hitGround(vec3 origin, vec3 dir, vec3 normal, float height) {
    float denom = dot(dir, normal);
    if (denom > -1e-6) return 1e8;
    float dist = -(dot(origin, normal) + height) / denom;
    return (dist > 1.0) ? dist : 1e8;
  }

  float hitGlobe(vec3 origin, vec3 dir, vec3 center, float radius) {
    vec3 offset = origin - center;
    float b = dot(offset, dir);
    float c = dot(offset, offset) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) return 1e8;
    return -b - sqrt(disc);
  }

  vec3 sampleAtmosphere(vec3 dir, float t) {
    float f1 = fractalNoise(dir.xy * uFractalScale + t * uBgFractalSpeed);
    float f2 = fractalNoise(dir.yz * (uFractalScale + 1.0) - t * (uBgFractalSpeed * 1.5));
    float redGlow  = smoothstep(0.85, 1.0, sin(dir.x * 12.0 + f1 * 8.0));
    float cyanGlow = smoothstep(0.90, 1.0, cos(dir.y * 15.0 + f2 * 10.0));
    float purpGlow = smoothstep(0.85, 1.0, sin(dir.z * 10.0 + (f1 + f2) * 4.0));
    // Pure black void instead of the codepen's dim purple base — the
    // contrast between black space and bright white hotspots is what
    // gives mirror tiles their characteristic bright-vs-dark mosaic.
    // Hotspot multiplier bumped 3.0 → 4.5 so the reflected highlights
    // pop hard against the black, keeping the ball lively and not flat.
    vec3 background = vec3(0.0);
    background += uColor1 * 4.5 * redGlow;
    background += uColor2 * 4.5 * cyanGlow;
    background += uColor3 * 4.5 * purpGlow;
    return background;
  }

  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Clip to a circle at the bouncing ball's on-screen position. Outside
    // the circle we emit fully-transparent black so the post pass can mask
    // the area cleanly. Inside, normCoords becomes ball-relative — (0,0)
    // at the ball center and ±0.343 at the ball edge (0.343 = the disco
    // ball's natural projected radius at zoom=1.0). That maps the codepen
    // shader's centred render onto the bouncing ball's footprint.
    vec2 fromBall = fragCoord - uBallCenter;
    float distFromBall = length(fromBall);
    if (distFromBall > uBallPixelRadius) {
      fragColor = vec4(0.0);
      return;
    }
    vec2 normCoords = fromBall / uBallPixelRadius * 0.343;
    float aperture = 0.01;
    float focalPlane = 3.5;
    vec3 finalRender = vec3(0.0);

    for (int s = 0; s < MAX_SAMPLES; s++) {
      vec2 jitter = hash2(normCoords + float(s) * 12.26) - 0.5;
      float timeOffset = iTime;
      #ifdef ENABLE_TEMPORAL_BLUR
      timeOffset += float(s) * 0.01 / float(MAX_SAMPLES);
      #endif

      vec3 camPos = vec3(0.0, 0.0, -3.5 * uZoom);
      #ifdef ENABLE_LENS_BLUR
      camPos.xy += jitter * aperture;
      vec3 rayDir = normalize(vec3(normCoords - jitter * aperture / focalPlane, 1.0));
      #else
      vec3 rayDir = normalize(vec3(normCoords - jitter / iResolution.y, 1.0));
      #endif

      float rX = timeOffset * uAutoRotSpeed + uManualRot.x;
      float rY = uManualRot.y;
      camPos.yz *= rot(rY);
      rayDir.yz *= rot(rY);
      camPos.xz *= rot(rX);
      rayDir.xz *= rot(rX);

      #ifdef ENABLE_CAMERA_WOBBLE
      camPos.xy *= rot(sin(timeOffset * 0.3) * 0.1);
      rayDir.xy *= rot(sin(timeOffset * 0.3) * 0.1);
      #endif

      vec3 pathThroughput = vec3(1.0);

      for (int bounce = 0; bounce < 4; bounce++) {
        float distGlobe = hitGlobe(camPos, rayDir, vec3(0.0), 1.2);
        float distGround = 1e8;
        if (bounce > 0) {
          distGround = hitGround(camPos, rayDir, vec3(-1.351, 0.476, 0.950), 1.5);
        }
        float closestHit = min(distGlobe, distGround);

        if (closestHit < 1e7) {
          vec3 hitPos = camPos + rayDir * closestHit;
          vec3 surfaceNormal;
          vec3 albedo = vec3(1.0);

          if (closestHit == distGlobe) {
            surfaceNormal = normalize(hitPos);
            float longitude = atan(surfaceNormal.z, surfaceNormal.x);
            float latitude = acos(clamp(surfaceNormal.y, -1.0, 1.0));
            float resolution = 15.8;
            float latQuant = floor(latitude * resolution) / resolution;
            float lonRes = max(16.5, floor(resolution * sin(latQuant * 1.11259)));
            float lonQuant = floor(longitude * lonRes) / lonRes;
            vec3 facetNorm = vec3(sin(latQuant) * cos(lonQuant), cos(latQuant), sin(latQuant) * sin(lonQuant));
            surfaceNormal = facetNorm;
            float patchNoise = fractalNoise(vec2(lonQuant, latQuant) * 2.2 - timeOffset * uCoreFractalSpeed);
            // Strong grayscale brightness range per facet — real mirror
            // tiles vary widely in apparent luminance because each catches
            // a different part of the environment. Range ~0.05..0.95 (was
            // 0.4..0.8) gives the high-contrast tile mosaic look without
            // bringing color back in.
            float facetBright = 0.5 + 0.45 * cos(patchNoise * 4.83);
            albedo = vec3(facetBright);
            float gapU = fract(longitude * lonRes);
            float gapV = fract(latitude * resolution);
            float mask = smoothstep(0.0, 0.1, gapU) * smoothstep(1.0, 0.95, gapU) *
                         smoothstep(0.0, 0.1, gapV) * smoothstep(1.0, 0.95, gapV);
            albedo *= (1.0 + 0.5 * mask);
          } else {
            // "Infinite floor" reflected by bounce rays — was tinted cyan
            // by vec3(0.1, 1.0, 0.8) grid lines, which then washed across
            // the ball's reflections. Neutralized to gray so the floor
            // adds depth-of-field highlights without tinting the ball.
            surfaceNormal = vec3(0.439, 0.812, 1.000);
            vec2 flatUV = hitPos.xz;
            float texNoise = fractalNoise(flatUV * 2.0 + timeOffset * 0.2);
            albedo = vec3(0.2) + vec3(0.3) * texNoise;
            vec2 grid = abs(fract(flatUV) - 2.2);
            float lineMask = smoothstep(1.87, 0.5, max(grid.x, grid.y));
            albedo += vec3(0.55) * lineMask;
          }

          float fresnelFactor = pow(max(1.2 - abs(dot(rayDir, surfaceNormal)), 0.4), 2.0);
          pathThroughput *= albedo * (0.5 + 0.5 * fresnelFactor);
          vec3 idealReflection = reflect(rayDir, surfaceNormal);
          vec3 randomScatter = normalize(hash3(normCoords + float(s) * 8.34 + float(bounce) * 3.76) - 0.6);
          if (dot(randomScatter, surfaceNormal) < 0.0) randomScatter = -randomScatter;
          rayDir = normalize(mix(idealReflection, randomScatter, uRoughness));
          camPos = hitPos + surfaceNormal * 0.025;
        } else {
          if (bounce == 0) {
            pathThroughput = vec3(0.0);
          } else {
            pathThroughput *= sampleAtmosphere(rayDir, timeOffset);
          }
          break;
        }
      }
      finalRender += max(pathThroughput, 0.0);
    }

    finalRender /= float(MAX_SAMPLES);
    fragColor = vec4(finalRender, 1.0);
  }

  void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
  }
`;

export const postFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform bool uShowLights;
  uniform float uRayDensity;
  uniform float uRayDecay;
  uniform float uRayWeight;
  uniform float uTime;
  // Added vs. the original CodePen: fades the entire pass in/out so the
  // disco overlay can blend over the bouncing-ball scene as discoIntensity
  // ramps from 0 → 1 and back.
  uniform float uFade;
  // Ball center in UV (0..1). The god rays emanate from this point — when
  // the bouncing ball travels across the screen, the rays follow.
  uniform vec2 uBallCenterUV;

  float hash(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec4 base = texture2D(tDiffuse, uv);
    vec3 col = base.rgb;
    vec3 flare = vec3(0.0);

    if (uShowLights) {
      vec2 center = uBallCenterUV;
      vec2 delta = uv - center;
      float dist = length(delta);
      vec2 dir = delta / (dist + 0.0001);
      vec2 rayVector = dir * (dist + 0.35);
      const int SAMPLES = 128;
      float threshold = 1.0;
      vec2 step = (rayVector * uRayDensity) / float(SAMPLES);
      float jitter = hash(vec3(gl_FragCoord.xy + vec2(uTime * 100.0, uTime * 50.0), uTime * 5.0));
      vec2 coord = uv - step * jitter;
      float illuminationDecay = 1.0;
      for (int i = 0; i < SAMPLES; i++) {
        vec3 samp = texture2D(tDiffuse, coord).rgb;
        vec3 highlight = max(vec3(0.0), samp - threshold);
        highlight = pow(highlight, vec3(0.8));
        highlight = min(highlight, vec3(3.0));
        flare += highlight * illuminationDecay * uRayWeight;
        illuminationDecay *= uRayDecay;
        coord -= step;
      }
      col += flare;
    }

    col = 1.0 - exp(-col * 2.5);
    // Pre-multiply uFade into the output so the additive blit (One/One)
    // can hand the colour straight to the framebuffer — alpha doesn't
    // mediate the contribution any more. As d ramps 0 → 1, RGB scales
    // 0 → full; that's the cross-fade. Rays add brightness wherever
    // flare > 0, no longer gated by the disco-circle mask.
    vec3 finalRgb = pow(max(col, vec3(0.0)), vec3(0.3995)) * uFade;
    gl_FragColor = vec4(finalRgb, 1.0);
  }
`;
