import React from 'react';
import {renderToString} from 'react-dom/server';
import {PublicApp} from './PublicApp.jsx';
export function render(url,config) {return renderToString(<PublicApp initialUrl={url} config={config}/>);}
