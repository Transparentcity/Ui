import styles from "../get-landing.module.css";

const EXAMPLES = [
  {
    icon: "🏪",
    stat: "New restaurants, shops, and businesses near you",
    body: "Openings and closings on your commercial corridors from business license and permit records in the city's open data portal.",
  },
  {
    icon: "📞",
    stat: "311 calls near your home",
    body: "Graffiti, potholes, broken streetlights, encampments, and other service requests logged by neighbors, sourced from the city's own 311 feed.",
  },
  {
    icon: "🚨",
    stat: "Crime and safety on your block",
    body: "Incidents reported within your chosen radius, plus emergency response times where the city publishes them, from official police open data.",
  },
  {
    icon: "🏠",
    stat: "New housing units near you",
    body: "Residential permits and new housing units filed on your street and within your radius, so you can see what is being built before crews arrive.",
  },
];

const STEPS = [
  {
    num: "1",
    title: "Enter your address",
    body: "Type any address, intersection, or drop a pin anywhere in your city. GPS works too.",
  },
  {
    num: "2",
    title: "Pick your radius",
    body: "Choose how wide an area to watch. 100m is about one block. 300m covers a neighborhood. You can change it any time.",
  },
  {
    num: "3",
    title: "Get your weekly",
    body: "Every week, your briefing focuses first on what happened within your chosen radius, then zooms out to your district and city.",
  },
];

export default function PersonalizationSection({ cityName }: { cityName: string }) {
  return (
    <section className={styles.personalizationSection}>
      <div className="container">
        <div className={styles.personalizationHeader}>
          <span className={styles.sectionBadge}>Hyper-local</span>
          <h2 className={styles.personalizationHeading}>
            Your block. Not just your city.
          </h2>
          <p className={styles.personalizationSubheading}>
            After you sign up, tell us where you live. We pin a circle around your home,
            as small as a single block, and monitor what happens inside it. You can also
            add a custom prompt so each weekly emphasizes what you care about most.
          </p>
        </div>

        {/* Radius visual + examples grid */}
        <div className={styles.personalizationLayout}>
          {/* Left: the radius concept visual */}
          <div className={styles.radiusVisual}>
            <div className={styles.radiusCircle}>
              <div className={styles.radiusCircleOuter} />
              <div className={styles.radiusCircleMid} />
              <div className={styles.radiusCircleInner} />
              <div className={styles.radiusPin}>📍</div>
              <div className={styles.radiusLabel100}>1 block</div>
              <div className={styles.radiusLabel300}>3 blocks</div>
              <div className={styles.radiusLabel700}>7 blocks</div>
            </div>
            <p className={styles.radiusCaption}>
              You choose the radius. The data is scoped to exactly that zone — pulled fresh each week from {cityName}&rsquo;s official open data portal.
            </p>
          </div>

          {/* Right: what you get */}
          <div className={styles.personalizationExamples}>
            {EXAMPLES.map((ex) => (
              <div key={ex.stat} className={styles.personalizationExample}>
                <span className={styles.personalizationExampleIcon}>{ex.icon}</span>
                <div>
                  <h3 className={styles.personalizationExampleStat}>{ex.stat}</h3>
                  <p className={styles.personalizationExampleBody}>{ex.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How setup works */}
        <div className={styles.personalizationSteps}>
          <h3 className={styles.personalizationStepsHeading}>
            Set up in under 30 seconds
          </h3>
          <div className={styles.personalizationStepsGrid}>
            {STEPS.map((step) => (
              <div key={step.num} className={styles.personalizationStep}>
                <div className={styles.personalizationStepNum}>{step.num}</div>
                <div>
                  <h4 className={styles.personalizationStepTitle}>{step.title}</h4>
                  <p className={styles.personalizationStepBody}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.personalizationCustom}>
          <h3 className={styles.personalizationCustomTitle}>
            Your weekly, tuned to your priorities
          </h3>
          <p className={styles.personalizationCustomBody}>
            Add your own custom prompt after signup. Maybe you care most about pollen
            counts, sidewalk conditions, or graffiti in your neighborhood. Real estate
            agent tracking listings and permits? Tell us what to watch and each issue
            scopes the briefing to the questions you want answered.
          </p>
        </div>
      </div>
    </section>
  );
}
