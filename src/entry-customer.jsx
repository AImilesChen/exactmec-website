import React from 'react';
import {createRoot} from 'react-dom/client';
import {CustomerPortal} from './customer/App.jsx';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './customer/styles.css';

createRoot(document.getElementById('root')).render(<CustomerPortal initialPath={location.pathname}/>);
