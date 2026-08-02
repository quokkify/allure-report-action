export default {
  name: "allure-report-action-smoke",
  output: "./allure-report",
  plugins: {
    awesome: {
      options: {
        reportName: "Allure report action smoke",
        singleFile: false,
        reportLanguage: "en",
        groupBy: ["epic", "feature", "story"],
      },
    },
  },
};
