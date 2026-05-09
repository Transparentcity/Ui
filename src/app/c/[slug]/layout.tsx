import CityDevBanner from "./CityDevBanner";

type Props = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export default async function CitySlugLayout({ children, params }: Props) {
  const { slug } = await params;
  return (
    <>
      <CityDevBanner slug={slug} />
      {children}
    </>
  );
}
