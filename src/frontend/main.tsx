import React from 'react';
import ReactDOM from 'react-dom/client';
import { AugmentosAuthProvider } from '@augmentos/react';
import App from './App';
import './index.css';

/**
 * Application entry point that provides AugmentOS authentication context
 * to the entire React component tree
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AugmentosAuthProvider>
      <App />
    </AugmentosAuthProvider>
  </React.StrictMode>
);