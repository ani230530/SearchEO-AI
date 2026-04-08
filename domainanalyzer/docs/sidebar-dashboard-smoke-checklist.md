# Sidebar Dashboard Smoke Checklist

Use this checklist after each modularization phase touching `src/pages/SidebarDashboard.tsx`.

## Navigation And Shell

- Load `/dashboard` and `/newdashboard`.
- Switch tabs: `overview`, `analytics`, `projects`, `publish`, `audit`, `gsc-analytics`, `profile`, `settings`.
- Reload and confirm the last active tab still restores from `localStorage.activeTab`.
- Visit `?tab=overview`, `?tab=analytics`, `?tab=projects`, `?tab=publish`, `?tab=settings`, `?tab=profile`, `?tab=gsc-analytics`.
- Visit `?tab=analytics&subtab=company-info` and `?tab=analytics&subtab=integration`.
- Visit `?tab=ai-checker` and confirm redirect behavior is unchanged.
- Collapse/expand the sidebar and confirm hover-to-expand behavior still works.
- Verify the mobile overlay and mobile sidebar open/close behavior.

## Overview And Audit

- Confirm the overview hero still loads current domain details and logo.
- Run an audit from the overview tab.
- Confirm the audit completion modal opens and can close cleanly.
- Use `View Full Report` and confirm scrolling/navigation still works.
- Use `Export PDF` and confirm the PDF action still renders.
- Open the audit tab directly and confirm prior audit data still loads.

## Company / Integrations

- Open `analytics > company-info` and verify company context renders as before.
- Open `analytics > integration` and confirm integration skeleton/loading states still work.
- Connect GSC, select a property, and disconnect it.
- Save WordPress credentials, reload the tab, and disconnect the integration.

## Projects And Campaigns

- Load the project list.
- Create, edit, favorite, and delete a project.
- Open a project and switch between split, graph, and table campaign views.
- Create/update/delete topics, pillar pages, sub pages, and keywords.
- Open the generation drawer and confirm its multi-step flow still works.
- Open a draft preview and close it.
- Confirm publish/generation status pills still update correctly.

## Publish And Reporting

- Open the publish tab and verify WordPress integration data is present.
- Run a publish flow and confirm status/error handling still works.
- Open GSC analytics and analytics report views and confirm they still render.
