import React from 'react';
import {createRoot,hydrateRoot} from 'react-dom/client';
import {PublicApp} from './PublicApp.jsx';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles.css';
import './redesign.css';
import './compositions.css';
import './v3.css';

const root=document.getElementById('root');
const app=<PublicApp/>;
if(root.hasChildNodes())hydrateRoot(root,app);else createRoot(root).render(app);
