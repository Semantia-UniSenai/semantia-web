import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AudienceContextForm from './AudienceContextForm.vue'

describe('AudienceContextForm', () => {
  it('declara contraste claro para o título sobre o modal escuro', () => {
    const wrapper = mount(AudienceContextForm)
    const title = wrapper.get('.context-form__title')

    expect(title.attributes('style')).toContain('color: #f4f7ff')
  })
})
