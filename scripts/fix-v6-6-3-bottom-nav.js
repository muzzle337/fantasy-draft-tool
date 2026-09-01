const fs=require('fs');
const path='styles-v6-5.css';
let css=fs.readFileSync(path,'utf8');
const old='.bottom-nav{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;}';
const next='.bottom-nav{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;}';
if(!css.includes(old)) throw new Error('Expected 4-column compact nav override not found');
css=css.replace(old,next);
fs.writeFileSync(path,css);
console.log('Restored bottom nav to 3 equal columns');