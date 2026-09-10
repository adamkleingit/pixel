import { vi } from 'vitest'

// ogl creates a WebGL canvas on construct. jsdom has no WebGL and spams
// "Not implemented: HTMLCanvasElement's getContext()" for every Overlay
// render. The orb already fails open when Renderer throws, so stub ogl
// in unit tests; e2e (Playwright Chromium) exercises the real renderer.
vi.mock('ogl', () => ({
  Renderer: class Renderer {
    constructor() {
      throw new Error('WebGL is not available in unit tests')
    }
  },
  Program: class Program {},
  Mesh: class Mesh {},
  Triangle: class Triangle {},
  Vec3: class Vec3 {
    set() {
      /* no-op */
    }
  },
}))
