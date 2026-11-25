"""Generate the website model and submission outputs. Spark is the default."""
import argparse, csv, json
from pathlib import Path
from retrieval import read_documents, positional_index, build_model, search, tokenize, doc_key

ROOT = Path(__file__).resolve().parents[1]
QUERIES = ['online learning','student assessment','online learning AND student assessment','online learning AND NOT student assessment']


def spark_index(documents):
    from pyspark.sql import SparkSession, functions as F
    spark = SparkSession.builder.appName('EduSearch Positional Index').master('local[2]').config('spark.ui.enabled','false').getOrCreate()
    spark.sparkContext.setLogLevel('ERROR')
    try:
        frame = spark.createDataFrame(list(documents.items()), ['doc','text'])
        tokens = frame.select('doc', F.posexplode(F.split(F.lower(F.trim('text')), r'\s+')).alias('offset','term')).filter(F.col('term')!='').withColumn('position',F.col('offset')+1)
        postings = tokens.groupBy('term','doc').agg(F.sort_array(F.collect_list('position')).alias('positions')).orderBy('term','doc')
        index = {}
        for row in postings.collect():
            index.setdefault(row.term,{})[row.doc] = row.positions
        return {t:dict(sorted(postings.items(),key=lambda p:doc_key(p[0]))) for t,postings in index.items()}
    finally:
        spark.stop()


def write_csv(path, header, rows):
    with path.open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f); writer.writerow(header); writer.writerows(rows)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine',choices=['spark','python'],default='spark',help='Python is an independent reference fallback, not a Spark substitute for submission.')
    parser.add_argument('--dataset',type=Path,default=ROOT/'dataset')
    parser.add_argument('--root',type=Path,default=ROOT)
    args=parser.parse_args(); docs=read_documents(args.dataset)
    index=spark_index(docs) if args.engine=='spark' else positional_index(docs)
    assert index==positional_index(docs), 'Index does not match the independent Python reference'
    model=build_model(docs,index); model['engine']=args.engine
    results=[search(model,q) for q in QUERIES]
    data=args.root/'data'; out=args.root/'outputs'; data.mkdir(parents=True,exist_ok=True); out.mkdir(parents=True,exist_ok=True)
    (data/'model.json').write_text(json.dumps(model,indent=2)+'\n',encoding='utf-8')
    (out/'query_results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    ids=[d['id'] for d in model['documents']]
    write_csv(out/'positional_index.csv',['term','document','positions'],((t,d,' '.join(map(str,p))) for t,ds in index.items() for d,p in ds.items()))
    for k,n in [('tf','tf'),('weightedTf','weighted_tf'),('tfidf','tfidf'),('normalized','normalized_tfidf')]:
        write_csv(out/f'{n}.csv',['term',*ids],([t,*model[k][t]] for t in model['terms']))
    write_csv(out/'df_idf.csv',['term','df','idf'],((t,model['df'][t],model['idf'][t]) for t in model['terms']))
    write_csv(out/'document_lengths.csv',['document','length'],zip(ids,model['lengths']))
    write_csv(out/'rankings.csv',['query','rank','document','similarity','starting_positions'],((q['query'],i,r['id'],r['score'],' | '.join(' '.join(map(str,p)) for p in r['positions'])) for q in results for i,r in enumerate(q['results'],1)))
    print(f'{args.engine}: {len(docs)} documents, {len(index)} terms')
    for q in results:
        print(q['query'], ' | '.join(f"{r['id']}: {r['score']:.4f}" for r in q['results']))

if __name__=='__main__': main()
