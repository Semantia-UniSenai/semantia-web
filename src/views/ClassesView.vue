<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createClass, joinClass, useListClasses } from '../api/generated/classes/classes'
import { useAuth } from '../stores/auth'
import ClassesHeader from '../components/classes/ClassesHeader.vue'
import { extractApiError } from '../components/classes/apiError'

const router = useRouter()
const { user, isProfessor } = useAuth()

const { data: classes, isLoading, isError, refetch } = useListClasses()

const hasClasses = computed(() => (classes.value?.length ?? 0) > 0)

const showCreate = ref(false)
const createInput = ref<HTMLInputElement | null>(null)
const newName = ref('')
const creating = ref(false)
const createError = ref('')

async function openCreate() {
  showCreate.value = true
  createError.value = ''
  await nextTick()
  createInput.value?.focus()
}

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  createError.value = ''
  creating.value = true
  try {
    await createClass({ name })
    newName.value = ''
    showCreate.value = false
    await refetch()
  } catch (e: unknown) {
    createError.value = extractApiError(e, 'Não foi possível criar a turma. Tente novamente.')
  } finally {
    creating.value = false
  }
}

const joinCode = ref('')
const joining = ref(false)
const joinError = ref('')

async function onJoin() {
  const inviteCode = joinCode.value.trim()
  if (!inviteCode) return
  joinError.value = ''
  joining.value = true
  try {
    const joined = await joinClass({ inviteCode })
    router.push(`/app/turmas/${joined.id}`)
  } catch (e: unknown) {
    joinError.value = extractApiError(e, 'Código inválido. Confira com o professor e tente de novo.')
  } finally {
    joining.value = false
  }
}

function membersLabel(count: number) {
  return count === 1 ? '1 aluno' : `${count} alunos`
}
</script>

<template>
  <div class="page">
    <ClassesHeader back-to="/app" back-label="Início" />

    <main class="wrap">
      <div class="head">
        <div>
          <h1>Minhas turmas</h1>
          <p class="lead">
            {{ isProfessor ? 'Crie turmas e inicie aulas ao vivo com transcrição em tempo real.' : 'Acompanhe as aulas ao vivo e as transcrições das suas turmas.' }}
          </p>
        </div>
        <button v-if="isProfessor && !showCreate" class="btn" type="button" @click="openCreate">
          + Criar turma
        </button>
      </div>

      <form v-if="isProfessor && showCreate" class="panel inline-form" @submit.prevent="onCreate">
        <label class="field">
          Nome da turma
          <input
            ref="createInput"
            v-model="newName"
            type="text"
            required
            maxlength="80"
            placeholder="Ex.: Português — 2º ano B"
          />
        </label>
        <p v-if="createError" class="err" role="alert">{{ createError }}</p>
        <div class="inline-form__actions">
          <button class="btn" type="submit" :disabled="creating">
            {{ creating ? 'Criando…' : 'Criar turma' }}
          </button>
          <button class="btn-ghost" type="button" :disabled="creating" @click="showCreate = false">
            Cancelar
          </button>
        </div>
      </form>

      <form v-if="!isProfessor" class="panel inline-form join" @submit.prevent="onJoin">
        <label class="field">
          Entrar numa turma
          <span class="field__hint">Digite o código de convite que o professor compartilhou.</span>
          <div class="join__row">
            <input
              v-model="joinCode"
              type="text"
              required
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              placeholder="Código de convite"
            />
            <button class="btn" type="submit" :disabled="joining">
              {{ joining ? 'Entrando…' : 'Entrar' }}
            </button>
          </div>
        </label>
        <p v-if="joinError" class="err" role="alert">{{ joinError }}</p>
      </form>

      <div v-if="isLoading" class="cards" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="card skeleton">
          <span class="sk sk--title"></span>
          <span class="sk sk--line"></span>
        </div>
      </div>

      <div v-else-if="isError" class="panel state" role="alert">
        <h2>Não deu para carregar as turmas</h2>
        <p>Verifique sua conexão e tente novamente.</p>
        <button class="btn" type="button" @click="refetch()">Tentar de novo</button>
      </div>

      <ul v-else-if="hasClasses" class="cards" role="list">
        <li v-for="c in classes" :key="c.id">
          <RouterLink class="card" :to="`/app/turmas/${c.id}`">
            <div class="card__top">
              <span class="card__badge" aria-hidden="true">{{ c.name.slice(0, 1).toUpperCase() }}</span>
              <span v-if="c.teacherId === user?.id" class="pill">Você é o professor</span>
            </div>
            <h2 class="card__name">{{ c.name }}</h2>
            <p class="card__meta">
              <template v-if="typeof c.memberCount === 'number'">{{ membersLabel(c.memberCount) }}</template>
              <template v-else-if="c.teacherName">Prof. {{ c.teacherName }}</template>
              <template v-else>Turma</template>
            </p>
          </RouterLink>
        </li>
      </ul>

      <div v-else class="panel state empty">
        <span class="empty__glyph brand-text" aria-hidden="true">Aa</span>
        <h2>{{ isProfessor ? 'Nenhuma turma ainda' : 'Você ainda não entrou em nenhuma turma' }}</h2>
        <p>
          {{ isProfessor
            ? 'Crie sua primeira turma para convidar alunos e iniciar aulas ao vivo com legenda em tempo real.'
            : 'Peça o código de convite ao seu professor e use o campo acima para entrar.' }}
        </p>
        <button v-if="isProfessor" class="btn" type="button" @click="openCreate">Criar minha primeira turma</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100svh;
  background: radial-gradient(70% 40% at 50% 0%, rgba(91, 134, 212, 0.08), transparent 70%), var(--bg);
}
.wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding: 28px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.head h1 {
  font-size: 28px;
  font-weight: 800;
}
.lead {
  margin-top: 6px;
  font-size: 14.5px;
  color: var(--ink-soft);
  max-width: 52ch;
}
.btn {
  padding: 12px 20px;
  border: 0;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-family: var(--display);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.btn-ghost {
  padding: 12px 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--ink-soft);
  cursor: pointer;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 22px;
  box-shadow: var(--shadow-sm);
}
.inline-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inline-form__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
.field__hint {
  font-weight: 400;
  color: var(--muted);
}
.field input {
  padding: 12px 14px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--bg);
  font: inherit;
  color: var(--ink);
  width: 100%;
}
.field input:focus {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
.join__row {
  display: flex;
  gap: 10px;
}
.join__row input {
  flex: 1;
  min-width: 0;
}
.err {
  color: #c0362c;
  font-size: 13.5px;
  font-weight: 600;
}
.cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--blue);
}
.card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-family: var(--display);
  font-weight: 800;
  font-size: 18px;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(91, 134, 212, 0.16), rgba(146, 119, 207, 0.14));
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
}
.card__name {
  font-size: 18px;
  font-weight: 800;
  color: var(--ink);
}
.card__meta {
  font-size: 13.5px;
  color: var(--ink-soft);
}
.state {
  text-align: center;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.state h2 {
  font-size: 20px;
  font-weight: 800;
}
.state p {
  font-size: 14.5px;
  color: var(--ink-soft);
  max-width: 48ch;
}
.state .btn {
  margin-top: 8px;
}
.empty__glyph {
  font-family: var(--display);
  font-weight: 800;
  font-size: 56px;
  line-height: 1;
}
.skeleton {
  pointer-events: none;
}
.sk {
  display: block;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--bg) 25%, var(--bg-2) 50%, var(--bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
.sk--title {
  height: 20px;
  width: 65%;
}
.sk--line {
  height: 14px;
  width: 40%;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 560px) {
  .wrap {
    padding: 20px 14px 48px;
  }
  .head h1 {
    font-size: 24px;
  }
  .head .btn,
  .inline-form__actions .btn,
  .inline-form__actions .btn-ghost {
    width: 100%;
  }
  .join__row {
    flex-direction: column;
  }
  .join__row .btn {
    width: 100%;
  }
}
</style>
