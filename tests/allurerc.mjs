export default {
  name: "allure-report-action-smoke",
  output: "./allure-report",
  variables: {
    "GitHub.RunId": "123",
    "Module A.Runner": "runner-a",
    "Module A.Module": "module-a",
    "Module B.Runner": "runner-b",
    "Module B.Module": "module-b",
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
