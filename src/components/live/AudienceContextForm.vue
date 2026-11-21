<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { AudienceContext } from '../../api/sessions-context'

withDefaults(
  defineProps<{
    saving?: boolean
    saveError?: string | null
  }>(),
  { saving: false, saveError: null },
)

const emit = defineEmits<{
  submit: [payload: { context: AudienceContext; requiresApproval: boolean }]
  skip: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  return Array.from(dialogRef.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
    (el) => el.offsetParent !== null,
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('skip')
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement
  if (event.shiftKey && (active === first || !dialogRef.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !dialogRef.value?.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null
  await nextTick()
  dialogRef.value?.querySelector<HTMLElement>('#ctx-meeting-type')?.focus()
})
onBeforeUnmount(() => previouslyFocused?.focus?.())

const fieldError = ref<string | null>(null)
const requiresApproval = ref(false)

const form = reactive<AudienceContext>({
  meetingType: 'escola',
  ageRange: 'adultos',
  portugueseFamiliarity: 'media',
  domain: '',
  simplificationLevel: 'moderada',
})

function submit() {
  if (!form.domain.trim()) {
    fieldError.value = 'Informe o assunto ou domínio da reunião.'
    return
  }
  fieldError.value = null
  emit('submit', {
    context: { ...form, domain: form.domain.trim() },
    requiresApproval: requiresApproval.value,
  })
}
</script>

<template>
  <div
    ref="dialogRef"
    class="context-form"
    role="dialog"
    aria-modal="true"
    aria-label="Configuração da plateia"
    @keydown="onKeydown"
  >
    <div class="context-form__inner">
      <h2 class="context-form__title" style="color: #f4f7ff">Configure a plateia</h2>
      <p class="context-form__desc">
        Essas informações orientam o agente de IA ao adaptar a transcrição. Você pode pular e
        configurar depois, mas a adaptação ficará mais precisa com o contexto preenchido.
      </p>

      <form @submit.prevent="submit" novalidate>
        <div class="field">
          <label for="ctx-meeting-type">Tipo de encontro</label>
          <select id="ctx-meeting-type" v-model="form.meetingType">
            <option value="escola">Escola / sala de aula</option>
            <option value="empresa">Empresa / reunião corporativa</option>
            <option value="palestra">Palestra / conferência</option>
            <option value="evento">Evento / celebração</option>
            <option value="comunidade">Comunidade / encontro social</option>
          </select>
        </div>

        <div class="field">
          <label for="ctx-age">Faixa etária predominante</label>
          <select id="ctx-age" v-model="form.ageRange">
            <option value="criancas">Crianças (até 12 anos)</option>
            <option value="adolescentes">Adolescentes (13–17 anos)</option>
            <option value="adultos">Adultos (18+ anos)</option>
            <option value="misto">Misto</option>
          </select>
        </div>

        <div class="field">
          <label for="ctx-pt">Familiaridade com português escrito</label>
          <select id="ctx-pt" v-model="form.portugueseFamiliarity">
            <option value="baixa">Baixa — preferem estruturas simples e curtas</option>
            <option value="media">Média — leem bem, mas frases longas cansam</option>
            <option value="alta">Alta — confortáveis com texto técnico</option>
          </select>
        </div>

        <div class="field">
          <label for="ctx-domain">
            Assunto ou domínio
            <span class="required" aria-hidden="true">*</span>
          </label>
          <input
            id="ctx-domain"
            v-model="form.domain"
            type="text"
            maxlength="200"
            placeholder="Ex.: Matemática — equações do 2º grau"
            aria-required="true"
            :aria-invalid="!!fieldError"
            :aria-describedby="fieldError ? 'ctx-domain-error' : undefined"
          />
          <span v-if="fieldError" id="ctx-domain-error" class="field__error" role="alert">
            {{ fieldError }}
          </span>
        </div>

        <div class="field">
          <label for="ctx-level">Nível de simplificação</label>
          <select id="ctx-level" v-model="form.simplificationLevel">
            <option value="leve">Leve — manter termos técnicos, ajustar estrutura</option>
            <option value="moderada">Moderada — substituir jargões, frases mais curtas</option>
            <option value="alta">Alta — linguagem simples, sem termos especializados</option>
          </select>
        </div>

        <div class="field field--toggle">
          <div class="toggle-row">
            <div class="toggle-info">
              <span id="ctx-approval-label" class="toggle-label">Controlar quem entra na sala</span>
              <span v-if="requiresApproval" class="toggle-sublabel">
                Participantes precisarão de aprovação antes de entrar
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-labelledby="ctx-approval-label"
              :aria-checked="requiresApproval"
              class="toggle-btn"
              :class="{ 'toggle-btn--on': requiresApproval }"
              @click="requiresApproval = !requiresApproval"
            >
              <span class="toggle-thumb" />
            </button>
          </div>
        </div>

        <p v-if="saveError" class="context-form__save-error" role="alert">
          {{ saveError }}
        </p>

        <div class="context-form__actions">
          <button type="button" class="btn-ghost" @click="emit('skip')">
            Pular por enquanto
          </button>
          <button type="submit" class="btn-primary" :disabled="saving">
            {{ saving ? 'Salvando…' : 'Salvar e continuar' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.context-form {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background: rgba(10, 14, 28, 0.85);
  backdrop-filter: blur(6px);
}

.context-form__inner {
  box-sizing: border-box;
  width: min(540px, 100%);
  max-height: calc(100vh - 32px);
  max-height: calc(
    100dvh - max(16px, env(safe-area-inset-top)) -
      max(16px, env(safe-area-inset-bottom))
  );
  padding: 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: #161e32;
  color: #dce4fa;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.context-form__title {
  margin: 0 0 8px;
  font-size: 1.25rem;
  font-weight: 800;
}

.context-form__desc {
  margin: 0 0 24px;
  color: #8895b3;
  font-size: 0.875rem;
  line-height: 1.6;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
}

.field label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #aab3d4;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.field select,
.field input {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: #1e2840;
  color: #dce4fa;
  font-size: 0.9375rem;
  transition: border-color 0.15s;
}

.field select:focus-visible,
.field input:focus-visible {
  border-color: #8fa6ff;
  outline: 3px solid #8fa6ff;
  outline-offset: 2px;
}

.field input[aria-invalid='true'] {
  border-color: #ff6b87;
}

.field__error {
  font-size: 0.8125rem;
  color: #ff9aac;
}

.context-form__save-error {
  margin: 0;
  color: #ffb1bf;
  font-size: 0.875rem;
  line-height: 1.5;
}

.required {
  color: #ff9aac;
  margin-left: 2px;
}

.field--toggle {
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: #1e2840;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: #dce4fa;
}

.toggle-sublabel {
  font-size: 0.75rem;
  color: #8895b3;
}

.toggle-btn {
  flex: 0 0 auto;
  width: 44px;
  height: 24px;
  padding: 2px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-btn--on {
  background: #4f6ef7;
}

.toggle-thumb {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s;
}

.toggle-btn--on .toggle-thumb {
  transform: translateX(20px);
}

.context-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.btn-ghost {
  padding: 10px 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: transparent;
  color: #8895b3;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.15s;
}

.btn-ghost:hover {
  color: #dce4fa;
}

.btn-primary {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: #3d5ce5;
  color: white;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) {
  background: #2f4bcc;
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
