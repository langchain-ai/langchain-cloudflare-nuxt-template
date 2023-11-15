<script setup lang="ts">
const options = [
  'Adam Smith',
  'Albert Camus',
  'Albert Einstein',
  'Alfred, Lord Tennyson',
  'Aristotle',
  'Attar of Nishapur',
  'Avicenna',
  'Bertrand Russell',
  'Blaise Pascal',
  'C.S. Lewis',
  'Catullus',
  'Cicero',
  'Confucius',
  'Dante Aligheri',
  'Dara Shikoh',
  'David Hume',
  'E.E. Cummings',
  'Edgar Allen Poe',
  'Emily Dickinson',
  'Emma Goldman',
  'Epicurus',
  'Friedrich Nietzsche',
  'Gottfried Leibniz',
  'Hannah Arendt',
  'Henry David Thoreau',
  'Hesiod',
  'Homer',
  'Horace',
  'Immanuel Kant',
  'Jean-Jacques Rousseau',
  'Jean-Paul Sarte',
  'John Calvin',
  'John Dewey',
  'John Keats',
  'John Locke',
  'John Milton',
  'John Stuart Mill',
  'Julius Caesar',
  'Karl Marx',
  'Langston Hughes',
  'Leo Tolstoy',
  'Lewis Carroll',
  'Li Bai',
  'Machiavelli',
  'Marcus Aurelius',
  'Mark Twain',
  'Mary Wollstonecraft',
  'Maya Angelou',
  'Michel Foucault',
  'Mozi',
  'Oscar Wilde',
  'Ovid',
  'Pablo Neruda',
  'Percy Bysshe Shelley',
  'Plato',
  'Ralph Waldo Emerson',
  'René Descartes',
  'Robert Frost',
  'Rumi',
  'Saint Augustine of Hippo',
  'Sappho',
  'Simone de Beauvoir',
  'Socrates',
  'Soren Kierkegaard',
  'Thomas Aquinas',
  'Thomas Hobbes',
  'Thomas Paine',
  'Virgil',
  'Voltaire',
  'Walt Whitman',
  'William Shakespeare'
];

const placeholders = [
  'What do you think of the lyrics of the song "Friday" by Rebecca Black?',
  'What do you think of the lyrics of the song "DNA." by Kendrick Lamar?',
  'What do you think of the lyrics of the song "Hey Ya" by Outkast?',
  'What are some things you\'d consider when buying a new car?',
  'Who was your best friend?',
  'What advice do you have for pursuing a career as a software engineer?',
  'What is your favorite food?',
  'If you were an animal, what would you be and why?',
  'How do you feel about ChatGPT?',
  'What techniques do you recommend learning to become a better Super Smash Bros. player?',
  'Would you have enjoyed surfing?',
  'How would you fight a bear?',
  'What was the hardest decision you ever had to make?',
  'What Hogwarts house would you have been sorted into?',
  'Who had the biggest influence on your life?',
  'What do you thnk of the lyrics of the song "All Star" by Smash Mouth?',
  'What is your opinion on tattoos of Latin mottos?',
  'What was your proudest moment?',
  'Why do you park on a driveway and drive on a parkway?',
  'Sell me this pen.',
  'How long would you survive in a zombie apocalypse?',
  'What would you do if you won a million dollars?',
  'If you could choose one superpower, what would it be and why?'
];

const chatContainer = ref<HTMLElement | null>(null);
const askForm = ref<HTMLElement | null>(null);
const selectedPhilosopher = ref(options[Math.floor(0 * options.length)]);
const questionPlaceholder = ref(placeholders[Math.floor(0 * placeholders.length)]);
const userQuestionField = ref<HTMLElement | null>(null);
const chatHistory = ref<typeof ChatHistory | null>(null);
const userQuestion = ref('');
const isLoading = ref(false);

const enterChatMode = async () => {
  window.requestAnimationFrame(() => {
    askForm.value?.classList.add('chat-mode');
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
  window.requestAnimationFrame(() => {
    chatContainer.value?.classList.add('has-messages');
  });
  questionPlaceholder.value = 'Ask a follow-up!';
}

const askPhilosopher = async (e:Event) => {
  e.preventDefault();
  if (!chatContainer.value || (chatHistory.value?.getMessages().length > 0 && !userQuestion.value)) {
    return;
  }
  isLoading.value = true;
  try {
    chatHistory.value?.addNewMessage({
      type: 'human',
      content: userQuestion.value || questionPlaceholder.value
    });
    userQuestion.value = '';
    const questionResponse = await fetch(`/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        person: selectedPhilosopher.value,
        messages: chatHistory.value?.getMessages()
      }),
      headers: {
        'Content-Type': 'application/json',
      }
    });
    if (!questionResponse.body) {
      return;
    }
    if (!chatContainer.value.classList.contains('has-messages')) {
      await enterChatMode();
    }
    const aiMessageIndex = chatHistory.value?.addNewMessage({
      type: 'ai',
      content: ''
    });
    window.history.pushState({}, document.title, '/');
    const reader = questionResponse.body.getReader();
    const textDecoder = new TextDecoder();
    await Promise.race([
      new Promise((resolve) => setTimeout(resolve, 20000)),
      new Promise((resolve) => {
        const stream = new ReadableStream({
          start(controller) {
            function push() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  controller.close();
                  resolve(true);
                  return;
                }
                chatHistory.value?.appendToMessage(textDecoder.decode(value), aiMessageIndex);
                controller.enqueue(value);
                push();
              });
            }
            push();
          }
        });
      })
    ]);
    isLoading.value = false;
  } catch (e) {
    isLoading.value = false;
  }
};

const onPhilosopherSwitch = () => {
  chatHistory.value?.clearMessages();
  window.history.pushState({}, document.title, '/');
  questionPlaceholder.value = placeholders[Math.floor(0 * placeholders.length)];
};

const setRandomQuestion = () => {
  userQuestion.value = placeholders[Math.floor(0 * placeholders.length)];
};

const getCurrentChatHistoryMessages = (): Message[] => {
  return chatHistory.value?.getMessages() || [];
}

</script>

<template>
  <div ref="chatContainer" class="chat">
    <ChatHistory class="chat-history" ref="chatHistory"></ChatHistory>
    <v-form ref="askForm" class="ask" @submit="askPhilosopher">
      <div class="row">
        <h1>
          Ask
        </h1>
        <!-- <v-autocomplete
          autocomplete="off"
          class="philosophers"
          name="philosophers"
          :items="options"
          variant="underlined"
          v-model="selectedPhilosopher"
          @update:model-value="onPhilosopherSwitch"
          :disabled="isLoading"
          ></v-autocomplete> -->
        <v-text-field
          ref="userQuestionField"
          v-model="userQuestion"
          :placeholder="questionPlaceholder"
          class="question"
          variant="underlined"
          append-inner-icon="mdi-send"
          @keydown.enter="askPhilosopher"
          @click:append-inner="askPhilosopher"
          :disabled="isLoading"
          ></v-text-field>
        <div class="extra-buttons-container">
          <v-btn class="random-button" icon="mdi-shuffle-variant" variant="plain" @mouseup="setRandomQuestion" :disabled="isLoading"></v-btn>
        </div>
      </div>
    </v-form>
    <footer><a href="https://jacobscript.dev" target="_blank">© Jacob Lee, 2023</a></footer>
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
.random-button {
  position: relative;
  left: 6px;
}
.extra-buttons-container {
  position: relative;
  right: 12px;
  bottom: 16px;
}
h1, .philosophers, .question {
  margin-right: 16px;
}
.philosophers {
  min-width: 240px;
  flex-grow: 0;
}
.question {
  flex-grow: 1;
  max-width: 100%;
  min-width: 300px;
}
.tagline h1 {
  display: flex;
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
