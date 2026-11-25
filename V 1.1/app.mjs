import {search,queries} from './src/engine.mjs';
const main=document.querySelector('main');
const labels={search:'Search',documents:'Documents',index:'Positional index',statistics:'Term statistics',vectors:'Vector space',validation:'Validation',method:'Methodology'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=4)=>Number(n).toFixed(d);
const dl=(file,label='Download CSV')=>`<a class="download small" href="./outputs/${file}" download>${label} ↓</a>`;
const heading=(label,title,description)=>`<p class="eyebrow">${label}</p><h1>${title}</h1><p class="lead">${description}</p>`;
let model, currentQuery=queries[0];
const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<${i?'td':'th scope="row"'} class="${v==='0'||v===0?'zero':''}">${esc(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table>${rows.length?'':'<p class="empty">No matching terms.</p>'}</div>`;
const stats=()=>`<div class="stats"><div class="stat"><span>Documents</span><strong>${model.documents.length}</strong></div><div class="stat"><span>Unique terms</span><strong>${model.terms.length}</strong></div><div class="stat"><span>Total tokens</span><strong>${model.documents.reduce((a,d)=>a+d.wordCount,0)}</strong></div></div>`;
function highlight(doc,phrases,positions){const found=new Set();positions.forEach((ps,i)=>ps.forEach(p=>{for(let j=0;j<phrases[i].trim().split(/\s+/).length;j++)found.add(p+j)}));return doc.text.trim().split(/\s+/).map((t,i)=>found.has(i+1)?`<mark>${esc(t)}</mark>`:esc(t)).join(' ')}
const modeNotes = {
  'AND': 'Exact adjacent tokens determine matches. Normalized TF-IDF determines rank.',
  'OR': 'Union of matching documents. Both phrases determine rank.',
  'NOT': 'Excluded phrase is used only for filtering. Ranking uses the positive phrase.',
  'AND NOT': 'Excluded phrase is used only for filtering. Ranking uses the positive phrase.',
  'XOR': 'Exclusive OR: matches documents containing either phrase, but not both.',
  'XNOR': 'Exclusive NOR: matches documents containing both phrases or neither.',
  'NAND': 'Not AND: matches documents that do not contain both phrases.',
  'NOR': 'Not OR: matches documents that contain neither phrase.',
  'PHRASE': 'Exact adjacent tokens determine matches. Normalized TF-IDF determines rank.'
};
function renderResults(q){const result=search(model,q);const {results,mode,phrases,queryWeights,queryLength}=result;document.querySelector('#results').innerHTML=`<div class="search-grid"><section aria-label="Ranked search results"><div class="section-title"><h2>Search results</h2><span class="muted small">${results.length} of ${model.documents.length} documents</span></div><div class="result-list">${results.length?results.map((d,i)=>`<article class="result"><div class="result-head"><span class="rank">${String(i+1).padStart(2,'0')}</span><a class="docname" href="#documents">${esc(d.id)}.txt</a><span class="score" title="Cosine similarity">${fmt(d.score)}</span></div><p>${highlight(d,phrases,d.positions)}</p><div class="result-meta"><span>${d.wordCount} tokens</span>${d.positions.map((ps,j)=>ps.length?`<span>${['AND','OR','XOR','XNOR','NAND','NOR'].includes(mode)?esc(phrases[j])+': ': 'Start: '}${ps.join(', ')}</span>`:'').join('')}<span>Cosine similarity</span></div><div class="bar" aria-hidden="true"><i style="width:${d.score*100}%"></i></div></article>`).join(''):'<div class="panel empty">No documents satisfy this query.<br>Try a shorter phrase or a different Boolean condition.</div>'}</div></section><aside class="panel inspector"><h2>Query details</h2><div class="metric"><span>Mode</span><strong>${esc(mode)}</strong></div><div class="metric"><span>Vector length</span><strong>${fmt(queryLength,6)}</strong></div><div class="metric"><span>Matched documents</span><strong>${results.length}</strong></div><h3 style="margin-top:18px">Query weights</h3>${table(['Term','TF-IDF','Unit'],queryWeights.map(w=>[w.term,fmt(w.tfidf),fmt(w.normalized)]))}<p class="small muted" style="margin:14px 0 0">${modeNotes[mode] || modeNotes.PHRASE}</p></aside></div>`;}
const searchExamples = [
  'online learning AND student assessment',
  'online learning OR student assessment',
  'online learning NOT student assessment',
  'online learning XOR student assessment',
  'online learning XNOR student assessment',
  'online learning',
  'student assessment',
  'student engagement and learning',
  'research and data'
];
function searchPage(){
  main.innerHTML = heading('Collection / Education','Search the collection','Find exact phrases in the assigned education documents, then rank matches by cosine similarity.') + stats() + `<section class="panel">
    <form class="search-form" id="search-form">
      <div class="search-label-row">
        <label for="query">Search query</label>
        <span class="operator-rule-hint">CAPITAL = Operator (e.g. <code>AND</code>, <code>XOR</code>) &middot; Lowercase = Normal words (e.g. <code>and</code>)</span>
      </div>
      <div class="input-row">
        <input id="query" type="search" autocomplete="off" placeholder="Enter a phrase or Boolean query (e.g. online learning XOR student assessment)" value="${esc(currentQuery)}" required>
        <button class="primary" type="submit">Search</button>
      </div>
    </form>
    <div class="examples">
      <span class="examples-label">Try a query</span>
      ${searchExamples.map(q => `<button class="chip" data-example="${esc(q)}">${esc(q)}</button>`).join('')}
    </div>
    <p id="query-error" class="error" role="alert" hidden></p>
  </section>
  <div id="results" aria-live="polite"></div>`;

  const input = main.querySelector('#query');

  const submit = q => {
    try {
      renderResults(q);
      currentQuery = q;
      document.querySelector('#query-error').hidden = true;
    } catch (e) {
      const err = document.querySelector('#query-error');
      err.textContent = e.message;
      err.hidden = false;
      document.querySelector('#results').innerHTML = '';
    }
  };

  main.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    submit(input.value);
  });
  main.querySelector('.primary').addEventListener('click', e => {
    e.preventDefault();
    submit(input.value);
  });

  main.querySelectorAll('[data-example]').forEach(b => {
    b.addEventListener('click', () => {
      const q = b.dataset.example;
      input.value = q;
      submit(q);
    });
  });

  submit(currentQuery);
}
function documentsPage(){main.innerHTML=heading('Collection / Source files','Documents','The original ten text files, preserved without stemming or stop-word removal.')+stats()+`<div class="document-grid">${model.documents.map(d=>`<article class="doc-card"><header><h3>${esc(d.id)}.txt</h3><span class="muted small">${d.wordCount} tokens · <a class="download" href="./dataset/${esc(d.id)}.txt" download>TXT ↓</a></span></header><p>${esc(d.text)}</p><div class="token-list">${d.text.trim().split(/\s+/).map((t,i)=>`<span class="token"><sup>${i+1}</sup>${esc(t)}</span>`).join('')}</div></article>`).join('')}</div>`;}
function indexPage(){main.innerHTML=heading('Part A / Indexing','Positional index','Each posting stores the document ID and every 1-based token position.')+`<section class="panel"><div class="section-title"><h2>Vocabulary postings</h2>${dl('positional_index.csv')}</div><div class="toolbar"><input type="search" id="term-filter" class="filter" placeholder="Filter terms…" aria-label="Filter terms"></div><div id="index-table"></div></section>`;const update=()=>{const q=main.querySelector('#term-filter').value.toLowerCase();main.querySelector('#index-table').innerHTML=table(['Term','DF','Document : positions'],model.terms.filter(t=>t.includes(q)).map(t=>[t,model.df[t],Object.entries(model.index[t]).map(([d,p])=>`${d}: ${p.join(', ')}`).join('  ·  ')]))};main.querySelector('#term-filter').addEventListener('input',update);update();}
function matrixPage(vector){const options=vector?[['tfidf','TF-IDF','tfidf.csv'],['normalized','Normalized TF-IDF','normalized_tfidf.csv'],['lengths','Document lengths','document_lengths.csv']]:[['tf','Raw TF','tf.csv'],['weightedTf','Weighted TF','weighted_tf.csv'],['dfidf','DF & IDF','df_idf.csv']];main.innerHTML=heading('Part B / '+(vector?'Vector model':'Term weighting'),vector?'Vector space':'Term statistics',vector?'Inspect document weights and L2-normalized vectors.':'Explore term occurrences, logarithmic weights and collection frequency.')+`<section class="panel"><div class="toolbar"><label for="matrix-select" class="small">View</label><select id="matrix-select">${options.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><input id="term-filter" class="filter" type="search" placeholder="Filter terms…" aria-label="Filter terms"><span id="matrix-download" style="margin-left:auto"></span></div><p class="matrix-note" id="matrix-note"></p><div id="matrix-table"></div></section>`;const update=()=>{const k=main.querySelector('#matrix-select').value,filter=main.querySelector('#term-filter'),terms=model.terms.filter(t=>t.includes(filter.value.toLowerCase()));filter.disabled=k==='lengths';main.querySelector('#matrix-download').innerHTML=dl(options.find(o=>o[0]===k)[2]);const notes={tf:'Raw TF counts all occurrences in a document.',weightedTf:'Weighted TF = 1 + log10(TF), or 0 when absent.',dfidf:'IDF = log10(N / DF). Rare terms receive higher weights.',tfidf:'TF-IDF = Weighted TF × IDF.',normalized:'Each nonzero document vector has unit L2 length.',lengths:'L2 length = square root of the sum of squared TF-IDF weights.'};main.querySelector('#matrix-note').textContent=notes[k];let headers,rows;if(k==='dfidf'){headers=['Term','DF','IDF'];rows=terms.map(t=>[t,model.df[t],fmt(model.idf[t])]);}else if(k==='lengths'){headers=['Document','L2 length'];rows=model.documents.map((d,i)=>[d.id,fmt(model.lengths[i],6)]);}else{headers=['Term',...model.documents.map(d=>d.id)];rows=terms.map(t=>[t,...model[k][t].map(v=>v===0?'0':k==='tf'?v:fmt(v))]);}main.querySelector('#matrix-table').innerHTML=table(headers,rows);};main.querySelector('#matrix-select').addEventListener('change',update);main.querySelector('#term-filter').addEventListener('input',update);update();}
const expected=[[['d1',1],['d5',.4476],['d2',.4226],['d9',.1939]],[['d3',.4226],['d5',.3051],['d8',.2731]],[['d5',.5322]],[['d1',1],['d2',.4226],['d9',.1939]]];
function validationPage(){const checks=queries.map((q,i)=>{const actual=search(model,q).results;const pass=actual.length===expected[i].length&&actual.every((r,j)=>r.id===expected[i][j][0]&&Math.abs(r.score-expected[i][j][1])<.00005);return {q,actual,pass,expected:expected[i]}});main.innerHTML=heading('Part C / Verification','Reference validation','Live calculations compared with the Education reference, pages 19–20.')+`<div class="panel"><div class="section-title"><h2>${checks.filter(c=>c.pass).length} / ${checks.length} query checks passed</h2>${dl('rankings.csv','Export rankings')}</div><p class="muted small">Scores are compared at four decimal places. The generated data uses the ${esc(model.engine)} indexing engine; the Spark build is included in the repository.</p></div>${checks.map(c=>`<section class="panel"><div class="section-title"><h3>${esc(c.q)}</h3><span class="pill">${c.pass?'PASS':'FAIL'}</span></div>${table(['Expected doc','Expected score','Actual doc','Actual score'],Array.from({length:Math.max(c.expected.length,c.actual.length)},(_,i)=>[c.expected[i]?.[0]??'—',c.expected[i]?fmt(c.expected[i][1]):'—',c.actual[i]?.id??'—',c.actual[i]?fmt(c.actual[i].score):'—']))}</section>`).join('')}`;}
function methodPage(){const stages=[['01 / Indexing','Positional index','Lowercase and split on whitespace. Store each token position starting from 1. Spark groups token occurrences by term and document.','term → document → positions'],['02 / Weighting','Term statistics','Raw TF counts occurrences. DF counts documents containing a term. IDF decreases as DF increases. Logarithmic TF limits the effect of repeated words.','wTF = 1 + log10(TF) if TF > 0; otherwise 0\nIDF = log10(N / DF)'],['03 / Representation','TF-IDF vectors','Multiply weighted TF by collection IDF. Divide every weight by the document L2 length to remove the effect of vector magnitude.','TF-IDF = wTF × IDF\n||d|| = sqrt(Σ w²)\nunit(d) = d / ||d||'],['04 / Retrieval','Phrase and Boolean search','Match tokens only when positions are consecutive. AND intersects phrase match sets; AND NOT subtracts the second set from the first.','AND: A ∩ B\nAND NOT: A − B'],['05 / Ranking','Cosine similarity','Normalize the query using the same collection IDF. Score only matching documents. AND ranks with both phrases; AND NOT uses only the positive phrase.','cos(q,d) = Σ unit(q) × unit(d)'],['06 / Deployment','Static architecture','Spark/Python exports model.json. The browser loads the index and weights, then computes searches live in JavaScript. GitHub Pages serves static files; no server or API key is required.','dataset → build.py → model.json → browser']];main.innerHTML=heading('Project / Technical notes','Methodology','Implementation conventions from the assigned project specification.')+`<div class="method-grid">${stages.map(([n,t,d,f])=>`<section class="panel"><p class="eyebrow">${n}</p><h2>${t}</h2><p>${d}</p><pre class="formula">${esc(f)}</pre></section>`).join('')}</div>`;}
function route(){const page=location.hash.slice(1);const p=Object.hasOwn(labels,page)?page:'search';document.querySelector('#breadcrumb').textContent=labels[p];document.querySelectorAll('[data-page]').forEach(a=>a.dataset.page===p?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));({search:searchPage,documents:documentsPage,index:indexPage,statistics:()=>matrixPage(false),vectors:()=>matrixPage(true),validation:validationPage,method:methodPage})[p]();}
const theme=document.querySelector('#theme');try{document.documentElement.dataset.theme=localStorage.getItem('edu-theme')||'light'}catch{}theme.addEventListener('click',()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('edu-theme',t)}catch{}});
try{const res=await fetch(new URL('./data/model.json',import.meta.url));if(!res.ok)throw Error(`HTTP ${res.status}`);model=await res.json();route();window.addEventListener('hashchange',route);}catch(e){main.innerHTML=`<div class="panel"><h1>Could not load the collection</h1><p>${esc(e.message)}</p><p>Serve this directory using <code>python -m http.server 8000</code> or open the published GitHub Pages site.</p></div>`;}
