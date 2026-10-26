import React from 'react';
import {useCmsHref} from './cms/Rendering.jsx';
export const Route=React.createContext(()=>{});
export function Link({href,children,onClick,...props}){
 href=useCmsHref(href);
 const go=React.useContext(Route);
 return <a href={href} {...props} onClick={e=>{onClick?.(e);if(props.target==="_blank"||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;if(href.startsWith('/')){e.preventDefault();go(href)}}}>{children}</a>
}
