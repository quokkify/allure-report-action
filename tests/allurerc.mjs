export default {
  name: "allure-report-action-smoke",
  output: "./allure-report",
  variables: {
    "GitHub.RunId": "123",
  },
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
