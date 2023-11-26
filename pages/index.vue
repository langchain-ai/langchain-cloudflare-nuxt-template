<script setup lang="ts">
import { fetchEventSource } from "@microsoft/fetch-event-source";

const chatContainer = ref<HTMLElement | null>(null);
const askForm = ref<HTMLElement | null>(null);
const questionPlaceholder = ref("Ask me about Cloudflare or agents!");
const userQuestionField = ref<HTMLElement | null>(null);
const chatHistory = ref<typeof ChatHistory | null>(null);
const userQuestion = ref("");
const isLoading = ref(false);
const currentRunId = ref<string | null>(null);
const currentTraceUrl = ref<string | null>(null);

const enterChatMode = async () => {
  window.requestAnimationFrame(() => {
    askForm.value?.classList.add("chat-mode");
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
  window.requestAnimationFrame(() => {
    chatContainer.value?.classList.add("has-messages");
  });
  questionPlaceholder.value = "Ask a follow-up!";
};

const shareRun = async (runId: string) => {
  const response = await fetch("/api/trace", {
    method: "POST",
    body: JSON.stringify({
      run_id: runId,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error("Share unsuccessful. Please try again later.");
  }
  const parsedResponse = await response.json();
  currentTraceUrl.value = parsedResponse.url;
};

const submitQuery = async (e: Event) => {
  e.preventDefault();
  if (
    !chatContainer.value ||
    (chatHistory.value?.getMessages().length > 0 && !userQuestion.value)
  ) {
    return;
  }
  isLoading.value = true;
  try {
    chatHistory.value?.addNewMessage({
      type: "human",
      content: userQuestion.value || questionPlaceholder.value,
    });
    userQuestion.value = "";
    if (!chatContainer.value.classList.contains("has-messages")) {
      await enterChatMode();
    }
    let aiMessageIndex: number;
    await fetchEventSource(`/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        messages: chatHistory.value?.getMessages(),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      openWhenHidden: true,
      onopen: async (response: Response) => {
        aiMessageIndex = chatHistory.value?.addNewMessage({
          type: "ai",
          content: "",
        });
        if (!chatContainer.value?.classList.contains("has-messages")) {
          await enterChatMode();
        }
        currentRunId.value = response.headers.get("x-langsmith-run-id");
      },
      onclose: async () => {
        const runId = currentRunId.value;
        if (runId) {
          await shareRun(runId);
        }
      },
      onerror: (e: Error) => {
        isLoading.value = false;
        throw e;
      },
      onmessage: async (msg: any) => {
        if (msg.event === "end") {
          isLoading.value = false;
        } else if (msg.event === "data" && msg.data) {
          chatHistory.value?.appendToMessage(
            JSON.parse(msg.data),
            aiMessageIndex,
          );
        }
      },
    });
  } catch (e) {
    isLoading.value = false;
    throw e;
  }
};
</script>

<template>
  <div ref="chatContainer" class="chat">
    <ChatHistory class="chat-history" ref="chatHistory"></ChatHistory>
    <v-form ref="askForm" class="ask" @submit="submitQuery">
      <div class="row">
        <h1>Ask</h1>
        <v-text-field
          ref="userQuestionField"
          v-model="userQuestion"
          :placeholder="questionPlaceholder"
          class="question"
          variant="underlined"
          append-inner-icon="mdi-send"
          @keydown.enter="submitQuery"
          @click:append-inner="submitQuery"
          :disabled="isLoading"
        >
          <template v-slot:loader>
            <v-progress-linear
              :active="isLoading"
              height="2"
              color="blue"
              indeterminate
            ></v-progress-linear>
          </template>
        </v-text-field>
        <v-btn v-if="currentTraceUrl" class="trace-button">
          <a :href="currentTraceUrl" target="_blank"> ⚒️ View Trace </a>
        </v-btn>
      </div>
    </v-form>
    <footer>
      <a
        href="https://github.com/langchain-ai/langchain-cloudflare-nuxt-template/"
        class="link-row"
        target="_blank"
      >
        <img src="/public/github-mark.svg" class="github-wordmark" />
        <span>View Source</span>
      </a>
    </footer>
  </div>
</template>

<style scoped>
.ask {
  transform: translate3d(0, -45vh, 0);
  transition: transform 200ms ease-in-out;
  margin-top: 24px;
  width: 100%;
}
.ask.chat-mode {
  transform: translate3d(0, 0, 0);
}
.link-row {
  display: flex;
  align-items: center;
}
.github-wordmark {
  height: 16px;
  margin-right: 4px;
}
.chat-history {
  visibility: hidden;
}
.chat.has-messages .chat-history {
  visibility: visible;
}
.chat {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  max-width: 1280px;
  padding: 24px 48px;
  margin: 0 auto;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
}

.trace-button {
  align-self: center;
}

h1,
.question {
  margin-right: 16px;
}
.question {
  flex-grow: 1;
  max-width: 100%;
  min-width: 300px;
}
input.question {
  width: 100%;
}

@media (max-width: 960px) {
  .chat {
    padding: 24px;
  }
}
</style>
