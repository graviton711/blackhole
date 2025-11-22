

// Simplex 3D Noise helper
const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

export const DISK_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vViewPosition;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const DISK_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uDensity;

varying vec2 vUv;
varying vec3 vViewPosition;

${NOISE_GLSL}

void main() {
    vec2 center = vec2(0.5);
    vec2 toCenter = vUv - center;
    float radius = length(toCenter) * 2.0; // Normalised 0..1 on ring width approx
    float angle = atan(toCenter.y, toCenter.x);

    // Spiral dynamics
    float rotation = uTime * uSpeed * 1.5;
    float spiralOffset = 4.0 / (radius + 0.1);
    float spiralAngle = angle + rotation + spiralOffset;

    // Complex turbulence
    float n1 = snoise(vec3(radius * 4.0, spiralAngle * 3.0, uTime * 0.3));
    float n2 = snoise(vec3(radius * 10.0, spiralAngle * 6.0, uTime * 0.6 + 10.0));
    float n3 = snoise(vec3(radius * 20.0, angle * 10.0 + rotation, uTime * 1.0));
    
    float noiseVal = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    
    // Create dust lanes / gaps
    float lanes = smoothstep(-0.2, 0.2, sin(radius * 20.0 + n1 * 2.0));
    
    // Intensity Profile
    float intensity = (noiseVal * 0.5 + 0.5);
    intensity *= (0.5 + 0.5 * lanes);
    
    // Edges soft fade
    float alpha = smoothstep(0.2, 0.3, radius) * smoothstep(1.0, 0.85, radius);
    
    // Doppler Effect Simulation
    float dopplerProxy = (vUv.x - 0.5) * 2.0; 
    float beaming = dopplerProxy * 0.8 * clamp(uSpeed, 0.5, 1.0);
    
    vec3 hotColor = vec3(0.6, 0.8, 1.0); 
    vec3 midColor = uColor;
    vec3 coldColor = vec3(0.8, 0.1, 0.0); 
    
    vec3 finalColor = mix(midColor, hotColor, smoothstep(0.0, 1.0, beaming));
    finalColor = mix(finalColor, coldColor, smoothstep(0.0, 1.0, -beaming));
    
    float brightness = 1.0 + beaming * 1.5;
    finalColor *= brightness;
    
    // Inner rim glow
    float rim = smoothstep(0.4, 0.2, radius);
    finalColor += vec3(1.0, 1.0, 1.0) * rim * 0.5;

    gl_FragColor = vec4(finalColor, alpha * uDensity * intensity * 2.0);
}
`;

export const PHOTON_RING_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = 1.0 - abs(r - 0.95) * 20.0;
  ring = clamp(ring, 0.0, 1.0);
  float shimmer = sin(vUv.x * 20.0 + uTime * 5.0) * 0.2 + 0.8;
  gl_FragColor = vec4(uColor, ring * shimmer);
}
`;

// Particle Jets Vertex Shader
export const JET_VERTEX_SHADER = `
uniform float uTime;
uniform float uSpeed;
attribute float aRandom;
attribute float aOffset;
varying float vOpacity;
varying vec3 vColor;

void main() {
  vec3 pos = position;
  float t = uTime * uSpeed * 2.0 + aOffset;
  float height = mod(t, 20.0); 
  float direction = sign(pos.y); 
  pos.y = direction * height;
  float spread = 0.1 + height * 0.15;
  float angle = height * 2.0 + aRandom * 6.28;
  pos.x = cos(angle) * spread;
  pos.z = sin(angle) * spread;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  gl_PointSize = (80.0 * aRandom + 40.0) * (1.0 / -mvPosition.z);
  vColor = mix(vec3(1.0), vec3(0.2, 0.4, 1.0), height / 20.0);
  vOpacity = smoothstep(0.0, 2.0, height) * (1.0 - smoothstep(15.0, 20.0, height));
}
`;

export const JET_FRAGMENT_SHADER = `
varying float vOpacity;
varying vec3 vColor;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  float glow = 1.0 - (dist * 2.0);
  glow = pow(glow, 1.5);
  gl_FragColor = vec4(vColor, vOpacity * glow);
}
`;

// ========================================================
// LASER (GAMMA RAY) SHADERS
// ========================================================

export const LASER_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const LASER_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor;
uniform float uLength;
varying vec2 vUv;

${NOISE_GLSL}

void main() {
    float beamWidth = abs(vUv.x - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.3, beamWidth);
    float outer = 1.0 - smoothstep(0.2, 0.8, beamWidth);
    float noise = snoise(vec3(vUv.x * 5.0, vUv.y * uLength * 0.5 + uTime * 25.0, 0.0));
    float streaks = smoothstep(0.4, 0.7, noise);
    float intensity = core * 2.0 + outer * 0.5 + streaks * 0.8;
    float fade = smoothstep(0.0, 0.05, vUv.y); 
    vec3 finalColor = mix(uColor, vec3(1.0, 1.0, 1.0), core * 0.8);
    finalColor += vec3(0.2) * streaks;
    gl_FragColor = vec4(finalColor, intensity * fade);
}
`;

// Optimized GPU Particle Shader for Gamma Ray bits
export const ENERGY_PARTICLE_VERTEX_SHADER = `
uniform float uTime;
uniform float uSpeed;
uniform float uLength;
attribute float aRandom;
attribute float aSpeed;
varying float vAlpha;

void main() {
  vec3 pos = position;
  
  // Animate along Z axis (assuming local space where -Z is forward)
  // Loop position based on time, speed, and random offset
  float move = uTime * aSpeed * 50.0; 
  
  // We want particles to flow from 0 to -uLength
  // Use modulo to cycle them
  float zPos = -mod(move + aRandom * 100.0, uLength);
  
  pos.z = zPos;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = (30.0 * (1.0 + aRandom)) / -mvPosition.z;
  
  // Fade out near start and end
  vAlpha = smoothstep(0.0, -5.0, zPos) * smoothstep(-uLength, -uLength + 5.0, zPos);
}
`;

export const ENERGY_PARTICLE_FRAGMENT_SHADER = `
varying float vAlpha;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  if(length(coord) > 0.5) discard;
  gl_FragColor = vec4(0.6, 1.0, 1.0, vAlpha * 0.8);
}
`;

// ========================================================
// PLANET DESTRUCTION SHADERS
// ========================================================
export const DESTRUCTION_VERTEX_SHADER = `
uniform float uProgress;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;

${NOISE_GLSL}

void main() {
  vUv = uv;
  vNormal = normal;
  vPos = position;
  float swell = sin(uProgress * 3.14) * 0.1 * uProgress;
  float shake = snoise(vec3(position * 2.0 + uProgress * 10.0)) * 0.1 * uProgress;
  vec3 newPos = position + normal * (swell + shake);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}
`;

export const DESTRUCTION_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uProgress; 
uniform sampler2D uTexture;
uniform vec3 uBaseColor;
varying vec2 vUv;
varying vec3 vNormal;

${NOISE_GLSL}

void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    vec3 color = texColor.rgb * uBaseColor;
    float noise = snoise(vec3(vUv * 8.0, uTime * 0.2));
    float threshold = uProgress * 1.2; 
    float edge = smoothstep(threshold - 0.1, threshold, noise * 0.5 + 0.5);
    float burned = smoothstep(threshold, threshold + 0.1, noise * 0.5 + 0.5);
    if (burned < 0.1) discard; 
    vec3 magmaColor = vec3(1.0, 0.5, 0.1) * 2.0;
    vec3 finalColor = mix(magmaColor, color, edge);
    finalColor += magmaColor * uProgress * 0.5;
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// --- ATMOSPHERIC DUST SHADERS ---
export const DUST_VERTEX_SHADER = `
uniform float uTime;
uniform float uExpansion;
attribute float aRandom;
attribute vec3 aDirection;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vec3 pos = position;
  
  // Expand outward based on direction
  float speed = 0.5 + aRandom * 0.5;
  vec3 movement = aDirection * uExpansion * speed;
  pos += movement;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Size increases slightly as it expands
  gl_PointSize = (50.0 + uExpansion * 10.0) * (1.0 + aRandom) / -mvPosition.z;
  
  // Fade out over time/expansion
  vAlpha = 1.0 - smoothstep(2.0, 15.0, uExpansion);
}
`;

export const DUST_FRAGMENT_SHADER = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if(dist > 0.5) discard;
  
  // Soft cloud look
  float cloud = 1.0 - smoothstep(0.1, 0.5, dist);
  gl_FragColor = vec4(uColor, vAlpha * cloud * 0.4);
}
`;


// ========================================================
// SPACETIME GRID SHADERS
// ========================================================
export const GRID_VERTEX_SHADER = `
uniform float uTime;
uniform float uPlanetDistances[8];
uniform float uPlanetSpeeds[8];
uniform float uPlanetSizes[8];
varying float vElevation;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  float d = length(pos.xy);
  float depression = 30.0 / (d + 2.0);
  for(int i = 0; i < 8; i++) {
      float angle = uTime * uPlanetSpeeds[i] * 0.1;
      float r = uPlanetDistances[i];
      vec2 pPos = vec2(cos(angle) * r, sin(angle) * r);
      vec2 gridWorldPos = vec2(pos.x, -pos.y);
      float distToPlanet = distance(gridWorldPos, pPos);
      float mass = uPlanetSizes[i];
      depression += (mass * 3.0) / (distToPlanet + 0.8);
  }
  pos.z -= depression; 
  vElevation = depression;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const GRID_FRAGMENT_SHADER = `
varying float vElevation;
varying vec2 vUv;
void main() {
  float gridX = step(0.95, fract(vUv.x * 60.0));
  float gridY = step(0.95, fract(vUv.y * 60.0));
  float grid = max(gridX, gridY);
  vec3 flatColor = vec3(0.0, 0.2, 0.4);
  vec3 deepColor = vec3(1.0, 0.2, 0.5);
  float intensity = smoothstep(0.0, 5.0, vElevation);
  vec3 color = mix(flatColor, deepColor, intensity);
  vec3 finalColor = mix(color, vec3(0.5, 0.8, 1.0), grid * 0.5);
  float dist = distance(vUv, vec2(0.5));
  float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
  gl_FragColor = vec4(finalColor, alpha * 0.6);
}
`;

// ========================================================
// GALAXY / NEBULA / EXPLOSION
// ========================================================
export const GALAXY_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const GALAXY_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor;
uniform float uArms;
uniform float uTwist;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
    vec2 uv = vUv - 0.5;
    float r = length(uv) * 2.0;
    float a = atan(uv.y, uv.x);
    if (r > 1.0) discard;
    float spiralAngle = a + r * uTwist - uTime * 0.2;
    float n = snoise(vec3(uv * 10.0, uTime * 0.1));
    float spiral = sin(spiralAngle * uArms);
    spiral = smoothstep(0.2, 0.8, spiral);
    float core = exp(-r * 5.0);
    float shape = (spiral * r * 1.5 + core) * (0.8 + n * 0.2);
    float alpha = shape * (1.0 - smoothstep(0.8, 1.0, r));
    vec3 finalColor = mix(uColor, vec3(1.0, 0.95, 0.8), core * 2.0);
    gl_FragColor = vec4(finalColor, alpha);
}
`;

export const NEBULA_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const NEBULA_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uDensity;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
    vec2 uv = vUv;
    float n1 = snoise(vec3(uv * 3.0, uTime * 0.05));
    float n2 = snoise(vec3(uv * 6.0 + 5.0, uTime * 0.1));
    float n3 = snoise(vec3(uv * 12.0 - 2.0, uTime * 0.15));
    float cloud = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    float dist = distance(uv, vec2(0.5));
    float shape = 1.0 - smoothstep(0.2, 0.5, dist);
    float alpha = smoothstep(0.2, 0.8, cloud + shape * 0.5) * uDensity;
    vec3 color = mix(uColor1, uColor2, n2 * 0.5 + 0.5);
    color *= (0.8 + 0.2 * n3);
    gl_FragColor = vec4(color, alpha * shape);
}
`;

export const EXPLOSION_VERTEX_SHADER = `
uniform float uTime;
uniform float uProgress; 
attribute float aRandom;
varying float vAlpha;
varying vec3 vColor;
void main() {
    vec3 pos = position;
    vec3 dir = normalize(pos); 
    float dist = uProgress * 20.0 * (1.0 + aRandom); 
    pos = dir * dist;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = (100.0 * (1.0 - uProgress)) / -mvPosition.z;
    vAlpha = 1.0 - uProgress;
    vColor = mix(vec3(1.0, 0.8, 0.2), vec3(0.5, 0.5, 0.5), uProgress);
}
`;

export const EXPLOSION_FRAGMENT_SHADER = `
varying float vAlpha;
varying vec3 vColor;
void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if(length(coord) > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha);
}
`;

// ========================================================
// ATMOSPHERE SHADERS
// ========================================================
export const ATMOSPHERE_VERTEX_SHADER = `
varying vec3 vPosition;
void main() {
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ATMOSPHERE_FRAGMENT_SHADER = `
uniform vec3 uColor;
varying vec3 vPosition;
void main() {
  // Simple gradient based on height relative to radius (approx 300)
  // We want horizon (low Y) to be opaque, zenith (high Y) to be transparent
  // vPosition is in object space (Sphere center 0,0,0)
  float height = vPosition.y;
  float maxH = 300.0; 
  float normH = clamp(height / maxH, 0.0, 1.0);
  
  // Alpha 1.0 at horizon (0), 0.0 at top
  float alpha = 1.0 - smoothstep(0.0, 0.6, normH); 
  
  gl_FragColor = vec4(uColor, alpha);
}
`;

export const PLANET_ATMOSPHERE_VERTEX_SHADER = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PLANET_ATMOSPHERE_FRAGMENT_SHADER = `
varying vec3 vNormal;
uniform vec3 uColor;
void main() {
  // Simulate scattering by using Fresnel-like rim lighting
  // Intensity increases at the edges
  float intensity = pow(0.75 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
  gl_FragColor = vec4(uColor, 1.0) * intensity;
}
`;

// ========================================================
// TERRAIN SHADERS (PROCEDURAL PLANET SURFACE)
// ========================================================

// We now only use Vertex Shader to pass data. Geometry is baked in CPU for perfect synchronization.
export const TERRAIN_VERTEX_SHADER = `
varying vec2 vUv;
varying float vElevation;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vec3 pos = position; // Position Z is already displaced in JS
  vElevation = pos.z; 
  vNormal = normal;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const TERRAIN_FRAGMENT_SHADER = `
varying vec2 vUv;
varying float vElevation;
varying vec3 vNormal;
varying vec3 vViewPosition;

// Biome Colors (Base Tints)
uniform vec3 uColorWater;
uniform vec3 uColorSand;
uniform vec3 uColorGrass;
uniform vec3 uColorRock;
uniform vec3 uColorSnow;
uniform vec3 uColorSky; 
uniform vec3 uSunPos; // DYNAMIC SUN POSITION

// Biome Textures (Procedural Arrays)
uniform sampler2D uTexWater;
uniform sampler2D uTexSand;
uniform sampler2D uTexGrass;
uniform sampler2D uTexRock;
uniform sampler2D uTexSnow;

void main() {
  // Normalize normal to prevent black spots (interpolation artifacts)
  vec3 normal = normalize(vNormal);
  
  float h = vElevation;
  float steepness = 1.0 - normal.z; // 0 = flat, 1 = vertical
  
  // Texture Coordinate Scaling for Tiling
  vec2 tUv = vUv * 20.0;

  // Sample Textures (Grayscale/Pattern heavily driven)
  vec3 texWater = texture2D(uTexWater, tUv).rgb;
  vec3 texSand  = texture2D(uTexSand, tUv).rgb;
  vec3 texGrass = texture2D(uTexGrass, tUv).rgb;
  vec3 texRock  = texture2D(uTexRock, tUv).rgb;
  vec3 texSnow  = texture2D(uTexSnow, tUv).rgb;

  // Base mixing weights
  float wWater = 0.0;
  float wSand = 0.0;
  float wGrass = 0.0;
  float wRock = 0.0;
  float wSnow = 0.0;

  // Height based mixing
  if (h < -2.0) {
      // Deep water
      wWater = 1.0;
  } else if (h < -1.0) {
      // Shallow water / Beach transition
      float t = smoothstep(-2.5, -1.0, h);
      wWater = 1.0 - t;
      wSand = t;
  } else if (h < 1.0) {
      // Beach to Grass
      float t = smoothstep(-1.0, 1.0, h);
      wSand = 1.0 - t;
      wGrass = t;
  } else if (h < 6.0) {
      // Grass to Rock (Lower mountain)
      float t = smoothstep(4.0, 6.0, h);
      wGrass = 1.0 - t;
      wRock = t;
  } else if (h < 12.0) {
      // Rock to Snow
      float t = smoothstep(9.0, 12.0, h);
      wRock = 1.0 - t;
      wSnow = t;
  } else {
      // Snow peaks
      wSnow = 1.0;
  }

  // Slope Override: Steep areas become Rock
  if (h > -1.0) {
      float rockFactor = smoothstep(0.1, 0.35, steepness);
      // Remove snow/grass/sand from steep areas, replace with Rock
      wRock = max(wRock, rockFactor);
      // Normalize weights roughly (approximation)
      float total = wWater + wSand + wGrass + wRock + wSnow;
      if(total > 0.001) {
         wWater /= total; wSand /= total; wGrass /= total; wRock /= total; wSnow /= total;
      }
  }

  // Combine Textures with Planet Biome Colors (Tinting)
  // Multiply texture intensity by the defined planet color to keep stylistic consistency
  vec3 colWaterCombined = texWater * uColorWater * 1.5; 
  vec3 colSandCombined  = texSand  * uColorSand * 1.2;
  vec3 colGrassCombined = texGrass * uColorGrass * 1.2;
  vec3 colRockCombined  = texRock  * uColorRock * 1.2;
  vec3 colSnowCombined  = texSnow  * uColorSnow * 1.2;

  vec3 finalColor = 
      colWaterCombined * wWater +
      colSandCombined  * wSand +
      colGrassCombined * wGrass +
      colRockCombined  * wRock +
      colSnowCombined  * wSnow;
  
  // Dynamic Lighting Calculation
  vec3 lightDir = normalize(uSunPos);
  float diff = max(dot(normal, lightDir), 0.0);
  
  // Reduce diffuse at night
  float dayNightFactor = smoothstep(-0.2, 0.2, lightDir.y);
  
  // Specular for water AND wet sand
  if (wWater > 0.5 || wSand > 0.5) { 
      vec3 viewDir = normalize(vViewPosition);
      vec3 reflectDir = reflect(-lightDir, normal);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
      // Blinding sun reflection
      finalColor += vec3(1.5) * spec * (wWater + wSand * 0.5) * dayNightFactor; 
  }

  // Ambient Light (Hemisphere Simulation)
  vec3 skyColor = mix(vec3(0.05, 0.05, 0.2), vec3(0.6, 0.8, 1.0), dayNightFactor); // Night blue to Day blue
  vec3 groundColor = vec3(0.3, 0.2, 0.1); 
  
  // Improved Ambient Mix: Ensure it never goes completely black
  vec3 ambient = mix(groundColor, skyColor, 0.5 * (normal.z + 1.0)) * 0.8; 
  
  // Add Shadow/Diff
  vec3 scatteredLight = ambient + vec3(0.9) * diff * dayNightFactor;
  
  // Soft Clamp minimum brightness to avoid absolute black spots
  scatteredLight = max(scatteredLight, vec3(0.05));

  finalColor *= scatteredLight;
  
  // Distance fog
  float dist = gl_FragCoord.z / gl_FragCoord.w;
  float fogFactor = smoothstep(50.0, 300.0, dist); // Pushed back fog for clearer view
  
  // Fog Color should match sky (Passed in via uniform updates or simulated here)
  // We can mix current sky color based on day/night
  finalColor = mix(finalColor, uColorSky * (0.1 + 0.9 * dayNightFactor), fogFactor);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ========================================================
// WATER FLOW SHADERS (ANIMATED)
// ========================================================
export const WATER_FLOW_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vViewPosition;
uniform float uTime;

void main() {
  vUv = uv;
  vec3 pos = position;
  
  // Add slight waves to geometry for depth
  pos.z += sin(pos.x * 0.2 + uTime * 1.5) * 0.2;
  pos.z += cos(pos.y * 0.2 + uTime * 1.2) * 0.2;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const WATER_FLOW_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor;
uniform sampler2D uTexture; // Procedural water noise texture

varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
    // Scroll texture in two directions
    vec2 uv1 = vUv * 30.0 + vec2(uTime * 0.05, uTime * 0.02);
    vec2 uv2 = vUv * 30.0 + vec2(-uTime * 0.02, uTime * 0.06);
    
    vec3 noise1 = texture2D(uTexture, uv1).rgb;
    vec3 noise2 = texture2D(uTexture, uv2).rgb;
    
    // Mix noise layers for turbulence
    vec3 noise = mix(noise1, noise2, 0.5);
    
    // Fake Normal based on noise intensity
    vec3 normal = normalize(vec3(noise.r - 0.5, noise.g - 0.5, 1.0));
    
    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    vec3 viewDir = normalize(vViewPosition);
    
    // Specular reflection (Sun)
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
    
    // Base color mixing
    vec3 baseColor = uColor * (0.5 + noise.b * 0.5); // Deep vs Light areas
    
    // Foam peaks (where noise is high)
    float foam = smoothstep(0.7, 0.8, noise.r * noise.g + spec * 0.5);
    
    vec3 finalColor = mix(baseColor, vec3(1.0), foam * 0.5);
    finalColor += vec3(0.8) * spec; // Add sun sparkle
    
    gl_FragColor = vec4(finalColor, 0.85); // Slight transparency
}
`;


// ========================================================
// TEXTURED VEGETATION SHADERS
// ========================================================

export const TEXTURED_LEAF_VERTEX_SHADER = `
varying vec2 vUv;
uniform float uTime;
uniform float uWindSpeed;
attribute float aPhase; 

void main() {
  vUv = uv;
  vec3 pos = position;
  
  // Instance Transform is handled automatically by InstancedMesh
  vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  
  // Wind sway: top vertices move
  // We assume foliage geometry has Y from 0 to Height
  if (position.y > 1.0) {
     float sway = sin(uTime * uWindSpeed + instancePos.x * 0.5) * 0.2;
     pos.x += sway * (position.y - 1.0);
     pos.z += cos(uTime * uWindSpeed * 0.8 + instancePos.z * 0.5) * 0.2 * (position.y - 1.0);
  }

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const TEXTURED_LEAF_FRAGMENT_SHADER = `
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 uColor;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  if (texColor.a < 0.5) discard; // Alpha Test
  
  // Mix texture brightness/noise with color
  vec3 finalColor = uColor * texColor.rgb;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export const TEXTURED_GRASS_VERTEX_SHADER = `
varying vec2 vUv;
uniform float uTime;
uniform float uWindSpeed;

void main() {
  vUv = uv;
  vec3 pos = position;
  
  // Grass Sway
  if (vUv.y > 0.1) {
      vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float wind = sin(uTime * uWindSpeed + instancePos.x * 0.2) * cos(uTime * uWindSpeed * 0.7 + instancePos.z * 0.2);
      pos.x += wind * 0.3 * vUv.y; 
  }
  
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const TEXTURED_GRASS_FRAGMENT_SHADER = `
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 uColor;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  if (texColor.a < 0.5) discard;
  
  // Multiply color by texture grayscale value
  vec3 finalColor = uColor * texColor.r; 
  // Gradient from bottom to top
  finalColor *= (0.5 + 0.5 * vUv.y);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ========================================================
// WEATHER SHADERS (RAIN / SNOW)
// ========================================================

export const WEATHER_VERTEX_SHADER = `
uniform float uTime;
uniform float uSpeed;
uniform vec3 uCenter; 
attribute float aRandom;
varying float vAlpha;

void main() {
  vec3 pos = position;
  
  // Falling Logic with Wrap-around relative to center
  float fall = uTime * uSpeed * (1.0 + aRandom * 0.5);
  
  float boxHeight = 50.0;
  
  // Initial position relative to origin
  vec3 initialPos = pos; 
  
  // Apply falling motion
  float y = initialPos.y - fall;
  y = mod(y, boxHeight);
  pos.y = y;
  
  // Wind Tilt (Simulate wind by offsetting X based on fall speed)
  if (uSpeed > 5.0) { // Only for rain
     pos.x += y * 0.2; 
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  gl_Position = projectionMatrix * mvPosition;
  
  // OPTIMIZATION: Cap point size significantly to prevent massive overdraw
  float size = (uSpeed > 5.0) ? 60.0 : 40.0; // Reduced from 400.0
  gl_PointSize = size / -mvPosition.z;
  
  vAlpha = 0.5 + aRandom * 0.3;
}
`;

export const WEATHER_FRAGMENT_SHADER = `
uniform int uType; // 0 = snow, 1 = rain
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  
  if (uType == 1) { // Rain (Streak)
      // Compress X to make it a line
      if (abs(coord.x) > 0.02) discard;
      // Fade ends
      float streak = 1.0 - abs(coord.y * 2.0);
      gl_FragColor = vec4(uColor, vAlpha * streak * 0.6);
  } else { // Snow (Soft Dot)
      float dist = length(coord);
      if (dist > 0.5) discard;
      float soft = 1.0 - dist * 2.0;
      gl_FragColor = vec4(uColor, vAlpha * soft);
  }
}
`;

// ========================================================
// ANIME TOON SHADERS
// ========================================================
export const ANIME_TOON_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const ANIME_TOON_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform sampler2D uTexture;
uniform vec3 uLightDir;
uniform vec3 uRimColor;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec2 uv = vUv * uUvScale + uUvOffset;
  vec4 texColor = texture2D(uTexture, uv);
  
  // Cel Shading Logic
  vec3 L = normalize(uLightDir);
  float NdotL = dot(vNormal, L);
  
  // Hard cut for anime look
  float lightIntensity = smoothstep(0.0, 0.05, NdotL);
  
  // Ambient/Shadow Color
  vec3 shadowColor = vec3(0.6, 0.6, 0.7);
  vec3 litColor = vec3(1.0, 1.0, 1.0);
  
  vec3 lightFactor = mix(shadowColor, litColor, lightIntensity);
  
  // Rim Lighting (Glowing Edges)
  vec3 V = normalize(vViewPosition);
  float rimDot = 1.0 - max(dot(V, vNormal), 0.0);
  // Rim only appears on the lit side usually, or strong backlight
  float rimIntensity = smoothstep(0.6, 1.0, rimDot) * (lightIntensity + 0.2);
  vec3 rim = uRimColor * rimIntensity * 0.5;
  
  vec3 finalColor = uColor * texColor.rgb * lightFactor + rim;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ========================================================
// SLASH EFFECT (SWORD CHI) SHADERS
// ========================================================
export const SLASH_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SLASH_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

void main() {
    // Crescent shape
    float dist = distance(vUv, vec2(0.5, 0.5));
    float ring = smoothstep(0.3, 0.5, dist) * smoothstep(0.5, 0.3, dist - 0.05);
    
    // Fade at ends (arc length)
    float angleFade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
    
    float alpha = ring * angleFade * uOpacity;
    
    vec3 glow = uColor * 2.0;
    gl_FragColor = vec4(glow, alpha);
}
`;


// --- SOLAR SYSTEM DATA ---
export const PLANETS = [
  { 
    name: 'Mercury', 
    color: '#A5A5A5', 
    size: 0.3, 
    distanceOffset: 0, 
    speed: 4.1,
    texture: 'https://assets.codepen.io/4273/mercury.jpg',
    weather: null,
    surface: {
        water: '#555555', sand: '#777777', grass: '#999999', rock: '#bbbbbb', snow: '#dddddd', sky: '#111111', scale: 1.5
    }
  },
  { 
    name: 'Venus',   
    color: '#E3BB76', 
    size: 0.5, 
    distanceOffset: 4, 
    speed: 3.2,
    texture: 'https://assets.codepen.io/4273/venus.jpg',
    weather: 'rain',
    weatherColor: '#cccc00', // Acid Rain
    surface: {
        water: '#e6b800', sand: '#ffcc00', grass: '#d4a017', rock: '#8a6600', snow: '#ffdb4d', sky: '#ccaa00', scale: 2.0
    }
  },
  { 
    name: 'Earth',   
    color: '#22A6B3', 
    size: 0.55, 
    distanceOffset: 8, 
    speed: 2.6,
    texture: 'https://assets.codepen.io/4273/earth.jpg',
    weather: 'rain',
    weatherColor: '#aaaaff',
    surface: {
        water: '#004488', sand: '#e6c200', grass: '#006600', rock: '#555555', snow: '#ffffff', sky: '#87CEEB', scale: 1.0
    }
  },
  { 
    name: 'Mars',    
    color: '#EB4D4B', 
    size: 0.4, 
    distanceOffset: 11, 
    speed: 2.1,
    texture: 'https://assets.codepen.io/4273/mars.jpg',
    weather: null,
    surface: {
        water: '#8b0000', sand: '#cd5c5c', grass: '#b22222', rock: '#800000', snow: '#ff6347', sky: '#ffaa88', scale: 1.2
    }
  },
  { 
    name: 'Jupiter', 
    color: '#F0932B', 
    size: 1.8, 
    distanceOffset: 18, 
    speed: 1.1,
    texture: 'https://assets.codepen.io/4273/jupiter.jpg',
    weather: null,
    surface: { // Gas Giant representation abstract
        water: '#d2691e', sand: '#cd853f', grass: '#f4a460', rock: '#8b4513', snow: '#ffdead', sky: '#ffcc99', scale: 2.5
    }
  },
  { 
    name: 'Saturn',  
    color: '#F6E58D', 
    size: 1.5, 
    distanceOffset: 26, 
    speed: 0.8, 
    hasRing: true,
    texture: 'https://assets.codepen.io/4273/saturn.jpg',
    weather: null,
    surface: {
        water: '#f0e68c', sand: '#khaki', grass: '#bdb76b', rock: '#808000', snow: '#fffacd', sky: '#ffeeaa', scale: 2.2
    }
  },
  { 
    name: 'Uranus',  
    color: '#7ED6DF', 
    size: 1.0, 
    distanceOffset: 33, 
    speed: 0.5,
    texture: 'https://assets.codepen.io/4273/uranus.jpg',
    weather: 'snow',
    weatherColor: '#ffffff',
    surface: {
        water: '#00ced1', sand: '#40e0d0', grass: '#20b2aa', rock: '#008b8b', snow: '#e0ffff', sky: '#99ffff', scale: 1.5
    }
  },
  { 
    name: 'Neptune', 
    color: '#4834D4', 
    size: 1.0, 
    distanceOffset: 39, 
    speed: 0.4,
    texture: 'https://assets.codepen.io/4273/neptune.jpg',
    weather: 'snow',
    weatherColor: '#aaaaff',
    surface: {
        water: '#000080', sand: '#0000cd', grass: '#4169e1', rock: '#191970', snow: '#87cefa', sky: '#5588ff', scale: 1.5
    }
  },
];

// --- EXOPLANETS DATA (Real candidates) ---
export const EXOPLANETS = [
  { 
    name: 'Proxima B',   
    color: '#D35400', 
    size: 0.6, 
    position: [120, 10, -120],
    description: 'Nằm trong vùng ở được của sao lùn đỏ Proxima Centauri.',
    texture: null,
    weather: 'rain',
    weatherColor: '#ffaa88',
    surface: {
        water: '#8b4513', sand: '#a0522d', grass: '#d2691e', rock: '#800000', snow: '#ffa07a', sky: '#ffaa88', scale: 1.5
    }
  },
  { 
    name: 'Kepler-186f', 
    color: '#27AE60', 
    size: 0.6, 
    position: [-150, -20, 100],
    description: 'Trái Đất thứ hai, có thể có nước lỏng.',
    texture: null,
    weather: 'snow',
    weatherColor: '#ffffff',
    surface: {
        water: '#2e8b57', sand: '#3cb371', grass: '#006400', rock: '#556b2f', snow: '#90ee90', sky: '#ccffcc', scale: 1.0
    }
  },
  { 
    name: 'TRAPPIST-1e', 
    color: '#2980B9', 
    size: 0.5, 
    position: [80, 40, 200],
    description: 'Một trong 7 hành tinh đá quay quanh sao Trappist.',
    texture: null,
    weather: null,
    surface: {
        water: '#4682b4', sand: '#87ceeb', grass: '#00bfff', rock: '#1e90ff', snow: '#e0ffff', sky: '#88ccff', scale: 1.1
    }
  }
];

// --- GALAXIES DATA ---
export const GALAXIES = [
  { name: 'Andromeda', position: [400, 100, -400], color: [0.6, 0.4, 0.9], size: 80, arms: 3.0, twist: 10.0 },
  { name: 'Triangulum', position: [-450, -50, 300], color: [0.2, 0.6, 0.9], size: 60, arms: 2.0, twist: 12.0 },
  { name: 'Sombrero', position: [200, 250, 500], color: [0.9, 0.7, 0.3], size: 70, arms: 5.0, twist: 20.0 },
  { name: 'Whirlpool', position: [-300, 300, -200], color: [0.8, 0.2, 0.4], size: 65, arms: 2.0, twist: 8.0 },
  { name: 'Centaurus A', position: [500, -200, 100], color: [0.9, 0.8, 0.6], size: 90, arms: 4.0, twist: 5.0 },
];

// --- NEBULAE DATA ---
export const NEBULAE = [
  { name: 'Orion', position: [250, -100, -250], color1: [0.8, 0.2, 0.5], color2: [0.2, 0.0, 0.4], size: 50 },
  { name: 'Crab', position: [-200, 150, 200], color1: [0.1, 0.5, 0.8], color2: [0.8, 0.3, 0.1], size: 40 },
  { name: 'Pillars', position: [300, 50, 300], color1: [0.8, 0.6, 0.2], color2: [0.3, 0.2, 0.1], size: 60 },
  { name: 'Helix', position: [-300, -200, -100], color1: [0.2, 0.8, 0.6], color2: [0.7, 0.1, 0.1], size: 45 },
];