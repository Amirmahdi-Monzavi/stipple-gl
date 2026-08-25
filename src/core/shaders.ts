export const POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aSize;
layout(location=2) in vec4 aColor;
uniform vec2 uCamOffset;
uniform float uCamScale;
uniform float uAlpha;
out vec4 vColor;
void main(){
  vec2 ndc = vec2(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0);
  ndc *= uCamScale;
  ndc += uCamOffset;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = aSize;
  vColor = vec4(aColor.rgb, aColor.a * uAlpha);
}`;

export const POINT_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 vColor;
uniform float uSoftness;
uniform float uCore;
out vec4 outColor;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 >= 1.0) discard;
  float soft = 1.0 - sqrt(d2);
  float halo = pow(soft, uSoftness);
  float core = pow(soft, uSoftness * 4.0);
  float alpha = min(1.0, halo * (1.0 - uCore) + core * uCore * 2.0) * vColor.a;
  if (alpha <= 0.003) discard;
  outColor = vec4(vColor.rgb * alpha, alpha);
}`;
