"""Reference retrieval pipeline: exact whitespace tokens, base-10 weights."""
from collections import Counter, defaultdict
from math import log10, sqrt
from pathlib import Path
import re


def tokenize(text):
    return text.lower().split()


def doc_key(doc):
    return int(doc[1:])


def read_documents(directory):
    return {p.stem: p.read_text(encoding='utf-8') for p in sorted(Path(directory).glob('d*.txt'), key=lambda p: doc_key(p.stem))}


def positional_index(documents):
    index = defaultdict(lambda: defaultdict(list))
    for doc, text in documents.items():
        for position, term in enumerate(tokenize(text), 1):
            index[term][doc].append(position)
    return {term: dict(index[term]) for term in sorted(index)}


def weighted_tf(tf):
    return 1 + log10(tf) if tf else 0.0


def vector_length(values):
    return sqrt(sum(v*v for v in values))


def build_model(documents, index):
    ids = sorted(documents, key=doc_key)
    if not ids:
        raise ValueError('No documents')
    terms = sorted(index)
    tf = {t: [len(index[t].get(d, [])) for d in ids] for t in terms}
    df = {t: len(index[t]) for t in terms}
    idf = {t: log10(len(ids)/df[t]) for t in terms}
    wtf = {t: [weighted_tf(v) for v in tf[t]] for t in terms}
    tfidf = {t: [v*idf[t] for v in wtf[t]] for t in terms}
    lengths = [vector_length(tfidf[t][i] for t in terms) for i in range(len(ids))]
    normalized = {t: [v/lengths[i] if lengths[i] else 0.0 for i,v in enumerate(tfidf[t])] for t in terms}
    return {'documents': [{'id': d, 'text': documents[d], 'wordCount': len(tokenize(documents[d]))} for d in ids], 'terms': terms, 'index': index, 'tf': tf, 'weightedTf': wtf, 'df': df, 'idf': idf, 'tfidf': tfidf, 'lengths': lengths, 'normalized': normalized}


def phrase_matches(index, phrase):
    tokens = tokenize(phrase)
    if not tokens or any(t not in index for t in tokens):
        return {}
    matches = {}
    for d, starts in index[tokens[0]].items():
        positions = [set(index[t].get(d, [])) for t in tokens]
        found = [p for p in starts if all(p+i in pos for i,pos in enumerate(positions))]
        if found:
            matches[d] = found
    return matches


OP_REGEX = r'\s+(AND\s+NOT|XNOR|XOR|NAND|NOR|AND|OR|NOT)\s+'
OP_TEST = r'\b(?:AND\s+NOT|XNOR|XOR|NAND|NOR|AND|OR|NOT)\b'
VALID_MODES = ('PHRASE','AND','OR','NOT','XOR','XNOR','NAND','NOR')


def parse_query(query):
    parts = re.split(OP_REGEX, query.strip())
    if len(parts) not in (1,3):
        raise ValueError('Use one phrase, or two phrases joined by an operator.')
    op = ' '.join(parts[1].split()) if len(parts)==3 else 'PHRASE'
    if op == 'AND NOT':
        op = 'NOT'
    if op not in VALID_MODES:
        raise ValueError('Use one phrase, or two phrases joined by an operator.')
    phrases = [p.strip().strip('"').strip() for p in parts[::2]]
    if any(not p or '"' in p or re.search(OP_TEST, p) for p in phrases):
        raise ValueError('Enter a valid phrase on each side of the operator.')
    return phrases, op


def search(model, query):
    phrases, mode = parse_query(query)
    left = phrase_matches(model['index'], phrases[0])
    right = phrase_matches(model['index'], phrases[1]) if len(phrases)==2 else {}
    all_docs = {d['id'] for d in model['documents']}
    left_set = set(left)
    right_set = set(right)
    if mode == 'AND':
        candidates = left_set & right_set
    elif mode in ('NOT', 'AND NOT'):
        candidates = left_set - right_set
    elif mode == 'OR':
        candidates = left_set | right_set
    elif mode == 'XOR':
        candidates = left_set ^ right_set
    elif mode == 'XNOR':
        candidates = (left_set & right_set) | (all_docs - (left_set | right_set))
    elif mode == 'NAND':
        candidates = all_docs - (left_set & right_set)
    elif mode == 'NOR':
        candidates = all_docs - (left_set | right_set)
    else:
        candidates = left_set
    scoring_phrases = phrases[:1] if mode in ('NOT','PHRASE') else phrases
    counts = Counter(tokenize(' '.join(scoring_phrases)))
    weights = {t: weighted_tf(c)*model['idf'].get(t,0) for t,c in counts.items()}
    length = vector_length(weights.values())
    unit = {t: v/length if length else 0.0 for t,v in weights.items()}
    rows = []
    for i,d in enumerate(model['documents']):
        doc = d['id']
        if doc in candidates:
            score = sum(v*model['normalized'][t][i] for t,v in unit.items() if t in model['normalized'])
            if mode in ('AND','OR','XOR','XNOR','NAND','NOR'):
                pos = [left.get(doc, []), right.get(doc, [])]
            else:
                pos = [left.get(doc, [])]
            rows.append({'id':doc, 'score':min(1.0,max(0.0,score)), 'positions':pos})
    rows.sort(key=lambda r:(-r['score'],doc_key(r['id'])))
    return {'query':query,'mode':mode,'phrases':phrases,'queryLength':length,'queryWeights':[{ 'term':t,'tf':c,'weightedTf':weighted_tf(c),'tfidf':weights[t],'normalized':unit[t]} for t,c in counts.items()], 'results':rows}
