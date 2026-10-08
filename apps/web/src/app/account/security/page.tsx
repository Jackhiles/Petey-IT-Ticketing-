import { can, getSecuritySettings, mustEnrollTwoFactor } from "@petey/core";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getMessages } from "@/messages";
import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorSettings } from "./two-factor-settings";

export default async function AccountSecurityPage() {
  const user = await requireUser();
  const t = getMessages();
  const settings = await getSecuritySettings();
  const mustEnroll = mustEnrollTwoFactor(user, settings);

  return (
    <>
      <PageHeader title={t.account.title} />
      <div className="grid gap-6 lg:grid-cols-2">
        {can(user, "twoFactor.enroll") && (
          <Card>
            <h2 className="mb-4 text-lg font-medium">{t.account.twoFactorTitle}</h2>
            {mustEnroll && (
              <div className="mb-4">
                <Alert tone="info">{t.account.twoFactorRequired}</Alert>
              </div>
            )}
            <TwoFactorSettings
              enabled={user.twoFactorEnabled}
              canDisable={!settings.requireTwoFactor}
            />
          </Card>
        )}
        <Card>
          <h2 className="mb-4 text-lg font-medium">{t.account.changePassword}</h2>
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
