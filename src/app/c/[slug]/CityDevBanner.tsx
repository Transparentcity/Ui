import styles from "./CityDevBanner.module.css";

const CITIES_IN_DEVELOPMENT = new Set(["minneapolis"]);

export default function CityDevBanner({ slug }: { slug: string }) {
  if (!CITIES_IN_DEVELOPMENT.has(slug.toLowerCase())) return null;

  return (
    <div className={styles.banner} role="status" data-city-dev-banner="true">
      <span className={styles.label}>In active development</span>
      <span>
        Send issues/ideas to{" "}
        <a
          className={styles.email}
          href="mailto:seymour@transparent.city?subject=Minneapolis%20feedback"
        >
          seymour@transparent.city
        </a>
      </span>
    </div>
  );
}
