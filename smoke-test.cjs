const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(new URL('./index.html', `file://${__filename}`), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert(match, 'inline application script exists');
new vm.Script(match[1], { filename: 'inline-app.js' });
const elements = new Map();
function elem(id='') {
  return { id, innerHTML:'', textContent:'', value:'', checked:false, dataset:{}, style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(){}, append(){}, remove(){}, focus(){}, setSelectionRange(){}, click(){}, closest(){return null} };
}
const document = {
  getElementById(id){ if(!elements.has(id)) elements.set(id,elem(id)); return elements.get(id); },
  querySelectorAll(){ return []; },
  querySelector(){ return null; },
  createElement(tag){ return elem(tag); },
  addEventListener(){},
};
const storage = new Map();
const localStorage = {getItem(k){return storage.get(k)||null},setItem(k,v){storage.set(k,String(v))},removeItem(k){storage.delete(k)}};
const context = {document,localStorage,window:{scrollTo(){}},console,Date,Math,JSON,Blob,URL,structuredClone:global.structuredClone,confirm(){return false},prompt(){return null},setTimeout(){return 0},clearTimeout(){},Number,String,Object,Array,RegExp,Map,Set};
vm.createContext(context);
vm.runInContext(match[1], context, {timeout:5000,filename:'inline-app.js'});
const checks = [];
function check(name, fn){fn(); checks.push(name);}
check('dashboard renders',()=>assert.match(document.getElementById('content').innerHTML,/Sales performance/));
check('seed has 8 products',()=>assert.equal(vm.runInContext('state.products.length',context),8));
check('seed has at least 12 orders',()=>assert.ok(vm.runInContext('state.orders.length',context)>=12));
check('seed has at least 8 customers',()=>assert.ok(vm.runInContext('state.customers.length',context)>=8));
check('seed has 10 conversations',()=>assert.equal(vm.runInContext('state.conversations.length',context),10));
check('all primary views render',()=>{
  for (const page of ['Overview','Inbox','Orders','Products & Inventory','Payments','Shipments','Customers','Analytics','AI Agent','Integrations','Settings']) {
    vm.runInContext(`go(${JSON.stringify(page)})`,context,{timeout:5000});
    assert.ok(document.getElementById('content').innerHTML.length>300,`${page} output should render`);
  }
});
check('order total reconciles items and shipping',()=>assert.equal(vm.runInContext("orderTotal(state.orders.find(o=>o.id==='FC-1048'))",context),1930));
check('order progression allows next step',()=>assert.equal(vm.runInContext("validTransition('Pending','Confirmed').ok",context),true));
check('order progression blocks skipping stages',()=>assert.equal(vm.runInContext("validTransition('Pending','Delivered').ok",context),false));
check('terminal order is locked',()=>assert.equal(vm.runInContext("validTransition('Delivered','Processing').ok",context),false));
check('duplicate payment references cannot be verified',()=>{
  vm.runInContext("state.payments.push({...state.payments[0],id:'PAY-DUP'})",context);
  const before=vm.runInContext("state.payments.find(p=>p.id==='PAY-7781').status",context);
  vm.runInContext("handleAction('verify-payment','PAY-7781')",context,{timeout:5000});
  const after=vm.runInContext("state.payments.find(p=>p.id==='PAY-7781').status",context);
  assert.equal(before,after);
});
console.log(`Passed ${checks.length} smoke checks:\n- ${checks.join('\n- ')}`);
