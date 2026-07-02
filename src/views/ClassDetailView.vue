<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { removeClassMember, useGetClass, useListClasses } from '../api/generated/classes/classes'
import { createSession, useListClassSessions } from '../api/generated/sessions/sessions'
import type { SessionDto } from '../api/generated/model'
import { useAuth } from '../stores/auth'
import ClassesHeader from '../components/classes/ClassesHeader.vue'
import InitialsAvatar from '../components/classes/InitialsAvatar.vue'
import CopyButton from '../components/classes/CopyButton.vue'
import { extractApiError } from '../components/classes/apiError'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()

const classId = computed(() => route.params.id as string)

const { data: klass, isLoading, isError, refetch } = useGetClass(classId)
const {
  data: sessions,
  isLoading: sessionsLoading,
  isError: sessionsError,
  refetch: refetchSessions,
} = useListClassSessions(classId)
const { data: myClasses } = useListClasses()

const isOwner = computed(() => !!klass.value && klass.value.teacherId === user?.value?.id)

const teacherName = computed(() => {
  if (isOwner.value) return user.value?.name ?? ''
  const summary = myClasses.value?.find((c) => c.id === classId.value)
  return summary?.teacherName ?? ''
})

const inviteLink = computed(() =>
  klass.value ? `${location.origin}/turma/convite/${klass.value.inviteCode}` : '',
)

function defaultTitle() {
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `Aula de ${date}`
}

const sessionTitle = ref(defaultTitle())
const starting = ref(false)
const startError = ref('')

async function onStartSession() {
  const title = sessionTitle.value.trim() || defaultTitle()
  startError.value = ''
  starting.value = true
  try {
    const session = await createSession({ title, classId: classId.value })
    router.push(`/app/aula/${session.id}`)
  } catch (e: unknown) {
    startError.value = extractApiError(e, 'Não foi possível iniciar a aula. Tente novamente.')
    starting.value = false
  }
}

const confirmingRemoval = ref<string | null>(null)
const removingId = ref<string | null>(null)
const removeError = ref('')

async function onRemoveMember(userId: string) {
  removeError.value = ''
  removingId.value = userId
  try {
    await removeClassMember(classId.value, userId)
    confirmingRemoval.value = null
    await refetch()
  } catch (e: unknown) {
    removeError.value = extractApiError(e, 'Não foi possível remover o aluno. Tente novamente.')
  } finally {
    removingId.value = null
  }
}

const liveSessions = computed(() => sessions.value?.filter((s) => s.status === 'LIVE') ?? [])

function formatSessionDate(s: SessionDto) {
  return new Date(s.startedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function enterSession(id: string) {
  router.push(`/app/aula/${id}`)
}
</script>

<template>
  <div class="page">
    <ClassesHeader back-to="/app/turmas" back-label="Turmas" />

    <main class="wrap">
      <div v-if="isLoading" class="panel skeleton" aria-hidden="true">
        <span class="sk sk--title"></span>
        <span class="sk sk--line"></span>
        <span class="sk sk--line short"></span>
      </div>

      <div v-else-if="isError || !klass" class="panel state" role="alert">
        <h1>Turma não encontrada</h1>
        <p>Ela pode ter sido removida ou você não tem acesso.</p>
        <div class="state__actions">
          <button class="btn" type="button" @click="refetch()">Tentar de novo</button>
          <RouterLink class="btn-ghost" to="/app/turmas">Voltar às turmas</RouterLink>
        </div>
      </div>

      <template v-else>
        <section class="panel hero">
          <div class="hero__info">
            <h1>{{ klass.name }}</h1>
            <p class="hero__meta">
              <template v-if="teacherName">Prof. {{ teacherName }}<span v-if="isOwner"> (você)</span> · </template>
              {{ klass.members.length === 1 ? '1 aluno' : `${klass.members.length} alunos` }}
            </p>
          </div>

          <div v-if="isOwner" class="invite" aria-label="Convite da turma">
            <span class="invite__label">Código de convite</span>
            <div class="invite__row">
              <code class="invite__code">{{ klass.inviteCode }}</code>
              <CopyButton :text="klass.inviteCode" label="Copiar código" />
              <CopyButton :text="inviteLink" label="Copiar link" copied-label="Link copiado!" />
            </div>
          </div>
        </section>

        <form v-if="isOwner" class="panel start" @submit.prevent="onStartSession">
          <div class="start__text">
            <h2>Aula ao vivo</h2>
            <p>Inicie uma sessão com transcrição em tempo real para toda a turma.</p>
          </div>
          <div class="start__row">
            <label class="field start__field">
              Título da aula
              <input v-model="sessionTitle" type="text" required maxlength="120" />
            </label>
            <button class="btn btn--live" type="submit" :disabled="starting">
              <span class="dot" aria-hidden="true"></span>
              {{ starting ? 'Iniciando…' : 'Iniciar aula ao vivo' }}
            </button>
          </div>
          <p v-if="startError" class="err" role="alert">{{ startError }}</p>
        </form>

        <div class="columns">
          <section class="panel">
            <div class="panel__head">
              <h2>Aulas</h2>
              <p>
                {{ liveSessions.length > 0 ? 'Tem aula acontecendo agora.' : 'Histórico de sessões da turma.' }}
              </p>
            </div>

            <div v-if="sessionsLoading" class="skeleton" aria-hidden="true">
              <span class="sk sk--line"></span>
              <span class="sk sk--line short"></span>
            </div>
            <div v-else-if="sessionsError" class="mini-state" role="alert">
              <p>Não deu para carregar as aulas.</p>
              <button class="btn-ghost" type="button" @click="refetchSessions()">Tentar de novo</button>
            </div>
            <p v-else-if="!sessions || sessions.length === 0" class="empty-line">
              Nenhuma aula ainda. {{ isOwner ? 'Inicie a primeira ali em cima.' : 'Quando o professor iniciar, ela aparece aqui.' }}
            </p>
            <ul v-else class="sessions" role="list">
              <li v-for="s in sessions" :key="s.id" class="session">
                <div class="session__info">
                  <span class="session__title">{{ s.title }}</span>
                  <span class="session__date">{{ formatSessionDate(s) }}</span>
                </div>
                <div class="session__side">
                  <span class="status" :class="s.status === 'LIVE' ? 'status--live' : 'status--ended'">
                    <span v-if="s.status === 'LIVE'" class="dot" aria-hidden="true"></span>
                    {{ s.status === 'LIVE' ? 'Ao vivo' : 'Encerrada' }}
                  </span>
                  <button v-if="s.status === 'LIVE'" class="btn btn--sm" type="button" @click="enterSession(s.id)">
                    Entrar na aula
                  </button>
                  <RouterLink v-else class="link" :to="`/app/aula/${s.id}`">
                    Transcrição disponível
                  </RouterLink>
                </div>
              </li>
            </ul>
          </section>

          <section class="panel">
            <div class="panel__head">
              <h2>Alunos</h2>
              <p>{{ klass.members.length === 0 ? 'Ninguém entrou ainda.' : 'Quem faz parte da turma.' }}</p>
            </div>

            <p v-if="klass.members.length === 0" class="empty-line">
              {{ isOwner ? 'Compartilhe o código ou o link de convite para os alunos entrarem.' : 'Nenhum aluno na turma ainda.' }}
            </p>
            <ul v-else class="members" role="list">
              <li v-for="m in klass.members" :key="m.userId" class="member">
                <InitialsAvatar :name="m.name" />
                <div class="member__info">
                  <span class="member__name">{{ m.name }}<em v-if="m.userId === user?.id"> (você)</em></span>
                  <span class="member__email">{{ m.email }}</span>
                </div>
                <div v-if="isOwner" class="member__actions">
                  <template v-if="confirmingRemoval === m.userId">
                    <span class="confirm-label">Remover {{ m.name.split(' ')[0] }}?</span>
                    <button
                      class="btn-danger"
                      type="button"
                      :disabled="removingId === m.userId"
                      @click="onRemoveMember(m.userId)"
                    >
                      {{ removingId === m.userId ? 'Removendo…' : 'Sim, remover' }}
                    </button>
                    <button class="btn-ghost btn--sm-ghost" type="button" @click="confirmingRemoval = null">
                      Cancelar
                    </button>
                  </template>
                  <button
                    v-else
                    class="remove"
                    type="button"
                    :aria-label="`Remover ${m.name} da turma`"
                    @click="confirmingRemoval = m.userId"
                  >
                    Remover
                  </button>
                </div>
              </li>
            </ul>
            <p v-if="removeError" class="err" role="alert">{{ removeError }}</p>
          </section>
        </div>
      </template>
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
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 22px;
  box-shadow: var(--shadow-sm);
}
.panel__head {
  margin-bottom: 16px;
}
.panel__head h2 {
  font-size: 20px;
  font-weight: 800;
}
.panel__head p {
  margin-top: 4px;
  font-size: 14px;
  color: var(--ink-soft);
}
.hero {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.hero__info h1 {
  font-size: 28px;
  font-weight: 800;
}
.hero__meta {
  margin-top: 6px;
  font-size: 14.5px;
  color: var(--ink-soft);
}
.invite {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  border: 1px dashed var(--line);
}
.invite__label {
  font-size: 12.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.invite__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.invite__code {
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-family: var(--display);
  font-weight: 800;
  font-size: 17px;
  letter-spacing: 0.12em;
  color: var(--ink);
}
.start {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.start__text h2 {
  font-size: 20px;
  font-weight: 800;
}
.start__text p {
  margin-top: 4px;
  font-size: 14px;
  color: var(--ink-soft);
}
.start__row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.start__field {
  flex: 1;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
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
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  text-decoration: none;
}
.btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.btn--sm {
  padding: 9px 14px;
  font-size: 13.5px;
  box-shadow: none;
}
.btn--live .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffe1e1;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
}
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--ink-soft);
  cursor: pointer;
  text-decoration: none;
}
.btn--sm-ghost {
  padding: 7px 12px;
  font-size: 13px;
}
.btn-danger {
  padding: 7px 12px;
  border: 0;
  border-radius: 10px;
  background: #c0362c;
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.btn-danger:disabled {
  opacity: 0.6;
  cursor: progress;
}
.err {
  color: #c0362c;
  font-size: 13.5px;
  font-weight: 600;
}
.columns {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  align-items: start;
}
.sessions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  flex-wrap: wrap;
}
.session__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.session__title {
  font-weight: 700;
  color: var(--ink);
  font-size: 15px;
}
.session__date {
  font-size: 13px;
  color: var(--muted);
}
.session__side {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
}
.status--live {
  background: rgba(192, 54, 44, 0.1);
  color: #b02c22;
}
.status--live .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d33a2f;
  animation: pulse 1.6s ease-in-out infinite;
}
.status--ended {
  background: var(--bg-2);
  color: var(--ink-soft);
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
.link {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--blue);
}
.members {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.member {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  flex-wrap: wrap;
}
.member__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.member__name {
  font-weight: 700;
  color: var(--ink);
  font-size: 14.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member__name em {
  font-style: normal;
  font-weight: 600;
  color: var(--muted);
}
.member__email {
  font-size: 12.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.confirm-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.remove {
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  font-size: 13px;
  color: #c0362c;
  cursor: pointer;
}
.remove:hover {
  border-color: #c0362c;
}
.empty-line {
  font-size: 14px;
  color: var(--muted);
}
.mini-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
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
.state h1 {
  font-size: 24px;
  font-weight: 800;
}
.state p {
  font-size: 14.5px;
  color: var(--ink-soft);
}
.state__actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sk {
  display: block;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--bg) 25%, var(--bg-2) 50%, var(--bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
.sk--title {
  height: 24px;
  width: 45%;
}
.sk--line {
  height: 15px;
  width: 70%;
}
.sk--line.short {
  width: 35%;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 860px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .wrap {
    padding: 20px 14px 48px;
  }
  .hero__info h1 {
    font-size: 23px;
  }
  .start__row {
    flex-direction: column;
    align-items: stretch;
  }
  .start__row .btn {
    width: 100%;
  }
  .session__side .btn--sm {
    width: 100%;
  }
  .invite__row .invite__code {
    width: 100%;
    text-align: center;
  }
}
</style>
