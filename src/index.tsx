import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ApiKeyProvider } from './context/ApiKeyContext';
import './styles/globals.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(container);
root.render(
  <React.StrictMode>
    <ApiKeyProvider>
      <App />
    </ApiKeyProvider>
  </React.StrictMode>
);