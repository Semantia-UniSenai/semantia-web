import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MeshShader from './MeshShader.vue'

const shaderMount = vi.hoisted(() => vi.fn())

vi.mock('@paper-design/shaders', () => ({
  ShaderMount: shaderMount,
  meshGradientFragmentShader: 'fragment',
  getShaderColorFromString: (color: string) => color,
  ShaderFitOptions: { cover: 'cover' },
}))

afterEach(() => vi.restoreAllMocks())

describe('MeshShader', () => {
  it('degrades silently when WebGL is not available', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    mount(MeshShader)

    expect(shaderMount).not.toHaveBeenCalled()
  })
})
