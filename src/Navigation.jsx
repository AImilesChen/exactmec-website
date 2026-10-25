import React from 'react';
export const Route=React.createContext(()=>{});
export function Link({href,children,onClick,...props}){
 const go=React.useContext(Route);
 return <a href={href} {...props} onClick={e=>{onClick?.(e);if(props.target==="_blank"||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;if(href.startsWith('/')){e.preventDefault();go(href)}}}>{children}</a>
}
