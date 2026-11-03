import ArticleEditor from '../ArticleEditor';

export default async function EditArticlePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // key: a fresh editor per article, so nothing carries over when moving between articles.
  return <ArticleEditor key={id} articleId={id} />;
}
