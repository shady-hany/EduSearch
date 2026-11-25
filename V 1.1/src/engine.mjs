// The browser consumes the same index and vectors exported by src/build.py.
export const queries = ['online learning', 'student assessment', 'online learning AND student assessment', 'online learning AND NOT student assessment'];
const tokenize = text => text.toLowerCase().trim().split(/\s+/).filter(Boolean);
const own = (obj, key) => Object.hasOwn(obj,key);
const weight = n => n ? 1 + Math.log10(n) : 0;
const docNumber = id => Number(id.slice(1));
const OP_REGEX = /\s+(AND\s+NOT|XNOR|XOR|NAND|NOR|AND|OR|NOT)\s+/;
const OP_TEST_REGEX = /\b(?:AND\s+NOT|XNOR|XOR|NAND|NOR|AND|OR|NOT)\b/;
const VALID_MODES = ['PHRASE','AND','OR','NOT','XOR','XNOR','NAND','NOR'];

export function parseQuery(query) {
  const parts = query.trim().split(OP_REGEX);
  let mode = parts.length === 3 ? parts[1].replace(/\s+/g,' ') : 'PHRASE';
  if (mode === 'AND NOT') mode = 'NOT';
  if (![1,3].includes(parts.length) || !VALID_MODES.includes(mode)) {
    throw Error('Use a single phrase or two phrases joined by an operator (AND, OR, NOT, XOR, XNOR).');
  }
  const phrases = parts.filter((_,i)=>i%2===0).map(s=>s.trim().replace(/^"|"$/g,'').trim());
  if (phrases.some(p=>!p || /"/.test(p) || OP_TEST_REGEX.test(p))) {
    throw Error('Enter a valid phrase on each side of the operator.');
  }
  return {mode,phrases};
}
export function phraseMatches(index, phrase) {
  const tokens=tokenize(phrase), matches={};
  if (!tokens.length || tokens.some(t=>!own(index,t))) return matches;
  for (const [id,starts] of Object.entries(index[tokens[0]])) {
    const sets=tokens.map(t=>new Set(index[t][id] || []));
    const positions=starts.filter(p=>sets.every((s,i)=>s.has(p+i)));
    if (positions.length) matches[id]=positions;
  }
  return matches;
}
export function search(model, query) {
  const {mode,phrases}=parseQuery(query);
  const left=phraseMatches(model.index,phrases[0]);
  const right=phrases.length===2 ? phraseMatches(model.index,phrases[1]):{};
  const scoringPhrases = ['NOT','PHRASE'].includes(mode) ? phrases.slice(0,1) : phrases;
  const counts=new Map();
  for(const t of tokenize(scoringPhrases.join(' '))) counts.set(t,(counts.get(t)||0)+1);
  const queryWeights=Array.from(counts,([term,tf])=>({term,tf,weightedTf:weight(tf),tfidf:weight(tf)*(own(model.idf,term)?model.idf[term]:0)}));
  const queryLength=Math.sqrt(queryWeights.reduce((s,w)=>s+w.tfidf**2,0));
  queryWeights.forEach(w=>w.normalized=queryLength?w.tfidf/queryLength:0);
  const results=model.documents.flatMap((doc,i)=>{
    const inLeft = own(left, doc.id);
    const inRight = own(right, doc.id);
    let match = false;
    switch(mode) {
      case 'AND': match = inLeft && inRight; break;
      case 'OR': match = inLeft || inRight; break;
      case 'NOT': match = inLeft && !inRight; break;
      case 'XOR': match = inLeft !== inRight; break;
      case 'XNOR': match = inLeft === inRight; break;
      case 'NAND': match = !(inLeft && inRight); break;
      case 'NOR': match = !inLeft && !inRight; break;
      case 'PHRASE': default: match = inLeft; break;
    }
    if (!match) return [];
    const score=queryWeights.reduce((s,w)=>s+w.normalized*(own(model.normalized,w.term)?model.normalized[w.term][i]:0),0);
    const positions = ['AND','OR','XOR','XNOR','NAND','NOR'].includes(mode)
      ? [left[doc.id] || [], right[doc.id] || []]
      : [left[doc.id] || []];
    return [{...doc,score:Math.max(0,Math.min(1,score)),positions}];
  }).sort((a,b)=>b.score-a.score||docNumber(a.id)-docNumber(b.id));
  return {query,mode,phrases,queryLength,queryWeights,results};
}
