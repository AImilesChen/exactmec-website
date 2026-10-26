import React from 'react';
import {renderToString} from 'react-dom/server.edge';
import {PublicApp} from './PublicApp.jsx';
export function render(url,config,cmsBundle) {return renderToString(<PublicApp initialUrl={url} config={config} cmsBundle={cmsBundle}/>);}
