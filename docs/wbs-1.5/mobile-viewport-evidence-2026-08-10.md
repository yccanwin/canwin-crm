# WBS 1.5 mobile viewport evidence

Status: **PASS for WEB-07 on the reviewed implementation SHA**

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `agent/wbs-1-5-auth-members`
- Pull request: [#10](https://github.com/yccanwin/canwin-crm/pull/10)
- Exact implementation SHA: `2563911b6cbb2253f470d4341d1048d740f487f1`
- Evidence capture: `2026-08-10 01:44-01:47`, Asia/Shanghai (UTC+8)
- Browser surface: Codex in-app Chromium browser with an explicit CSS viewport
  of `360 x 800`
- Entry point: `apps/web/evidence/auth-mobile.html`
- Component entry: `apps/web/src/evidence/auth-mobile.tsx`

The evidence fixture reuses the production `LoginPage`, `InviteAcceptPage`,
`HomePage`, `AuthContext`, and production stylesheet. It is not imported by
`apps/web/src/main.tsx` and is not a production authentication route. All
displayed identities and UUIDs are synthetic.

## Measurements

The acceptance rule is
`document.documentElement.scrollWidth <= window.innerWidth`. Element geometry
was also checked so the forms, messages, and action buttons remained visible
inside the viewport.

| State | Viewport | Document scroll width | Direct interaction and geometry result | Disposition |
| --- | ---: | ---: | --- | --- |
| Independent login | `360 x 800` | `360` | Email and password controls occupied horizontal coordinates `43..317`; the login button occupied `43..317`; every inspected main/card/control rectangle was visible and inside the viewport | PASS |
| Login submit progress | `360 x 800` | `360` | Synthetic credentials were entered; the actual button changed to `正在验证…`; completion reached the actual workbench | PASS |
| Invitation form | `360 x 800` | `360` | Both password controls and `完成激活` were visible and within the viewport | PASS |
| Invitation validation error | `360 x 800` | `360` | A synthetic mismatched confirmation produced `两次输入的密码不一致。`; the alert was visible and inside the viewport | PASS |
| Invitation submit progress | `360 x 800` | `360` | Matching synthetic passwords changed the actual button to `正在激活…`; the progress button remained inside the viewport and completion reached the workbench | PASS |
| Active workbench | `360 x 800` | `345` | All inspected main/section rectangles were inside the viewport; the actual `退出` control was visible and inside the viewport | PASS |
| Logout and post-logout state | `360 x 800` | `360` after logout | Clicking `退出` disabled the button during progress and then rendered the actual independent login page without horizontal overflow | PASS |

## Machine-readable sanitized summary

```json
{
  "implementation_sha": "2563911b6cbb2253f470d4341d1048d740f487f1",
  "viewport": { "width": 360, "height": 800 },
  "login": { "scroll_width": 360, "controls_within_viewport": true, "progress_observed": true },
  "invite": { "scroll_width": 360, "validation_alert_within_viewport": true, "progress_observed": true },
  "home": { "scroll_width": 345, "logout_visible": true, "logout_within_viewport": true },
  "post_logout": { "scroll_width": 360, "login_visible": true },
  "horizontal_overflow": false,
  "synthetic_data_only": true
}
```

## Security and scope boundary

- No real email, invitation link/token, JWT, key, hosted project reference,
  employee identity, customer data, or document content was used or recorded.
- The login input used a reserved `.invalid` synthetic address. Password input
  values were synthetic and are not retained in this record.
- The invitation fixture uses only the reviewed synthetic UUID namespace and
  does not call Supabase or deliver an invitation.
- This record closes WEB-07 for the WBS 1.5 Auth slice only. Full mobile
  coverage for later CRM business modules remains WBS 7.4.

This evidence is an internal Agent 0 capture. It must still be inspected by the
third-party supervisor and independently tied to the final documentation tail
before formal WBS completion.
