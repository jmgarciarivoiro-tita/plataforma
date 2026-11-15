import '@mantine/core/styles.css';
import { createTheme, MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

// Tema base neutro; se reemplaza por el sistema de diseño corporativo (@plataforma/ui) más adelante.
const tema = createTheme({ primaryColor: 'blue', defaultRadius: 'md' });

const raiz = document.getElementById('root');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <MantineProvider theme={tema}>
        <App />
      </MantineProvider>
    </StrictMode>,
  );
}
