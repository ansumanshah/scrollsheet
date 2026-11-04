import pkg from "../../../packages/scrollsheet/package.json";

export const SITE = "https://scrollsheet.dev";

export interface Faq {
  id: string;
  question: string;
  answerHtml: string;
  answerText: string;
}

export interface Crumb {
  name: string;
  path: string;
}

export const softwareSourceCode = () => ({
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "scrollsheet",
  description:
    "React bottom sheets, drawers, dialogs, side panels, and toasts built on a native dialog and CSS scroll-snap.",
  url: SITE,
  codeRepository: "https://github.com/ansumanshah/scrollsheet",
  programmingLanguage: "TypeScript",
  runtimePlatform: "React 18+",
  license: "https://opensource.org/licenses/MIT",
  version: pkg.version,
  author: { "@type": "Person", name: "Ansuman Shah", url: "https://github.com/ansumanshah" },
});

export const faqPage = (faqs: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answerText },
  })),
});

export const breadcrumbs = (crumbs: Crumb[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.name,
    item: `${SITE}${c.path}`,
  })),
});
