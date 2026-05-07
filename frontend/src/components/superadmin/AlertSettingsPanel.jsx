import { useEffect, useState } from 'react'
import {
  fetchAlertConfiguration,
  sendAlertTestEmail,
  updateAlertRules,
  updateSmtpSettings,
} from '../../services/superAdminApi'

function textList(value = []) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function parseTextList(value = '') {
  return String(value)
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed right-6 top-24 z-[120] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold">{toast.title}</p>
              <p className="mt-1 text-sm">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-xs font-bold uppercase tracking-wide opacity-70 transition hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ToggleField({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div>
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-[58px] shrink-0 items-center rounded-full p-1 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`block h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? 'translate-x-[26px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function SliderField({ label, value, min = 0, max = 100, suffix = '%', onChange }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">Adjust the trigger threshold for this metric.</p>
        </div>
        <div className="rounded-xl bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
          {value}{suffix}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600"
      />
    </div>
  )
}

const initialSmtpForm = {
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPassword: '',
  senderEmail: '',
  senderName: '',
  sslEnabled: true,
  alertsEnabled: true,
  alertRecipientEmails: '',
  ccEmails: '',
  bccEmails: '',
  hasPassword: false,
}

const initialRulesForm = {
  cpuUsageThreshold: 85,
  memoryUsageThreshold: 85,
  diskUsageThreshold: 90,
  temperatureThreshold: 35,
  powerFailureAlertEnabled: true,
  vmAddedAlertEnabled: true,
  vmRemovedAlertEnabled: true,
  vmPowerAlertEnabled: true,
  hostDownAlertEnabled: true,
  rduAlertEnabled: true,
  dashboardParameterChangeEnabled: true,
}

export default function AlertSettingsPanel({ children }) {
  const [smtpForm, setSmtpForm] = useState(initialSmtpForm)
  const [rulesForm, setRulesForm] = useState(initialRulesForm)
  const [loading, setLoading] = useState(true)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [testingMail, setTestingMail] = useState(false)
  const [toasts, setToasts] = useState([])

  function pushToast(type, title, message) {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current, { id, type, title, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4500)
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      setLoading(true)
      const response = await fetchAlertConfiguration()

      if (cancelled) return

      if (!response) {
        pushToast('error', 'Load failed', 'Unable to load SMTP configuration and alert rules.')
        setLoading(false)
        return
      }

      setSmtpForm({
        smtpHost: response.smtpSettings?.smtpHost || '',
        smtpPort: response.smtpSettings?.smtpPort || 587,
        smtpUser: response.smtpSettings?.smtpUser || '',
        smtpPassword: '',
        senderEmail: response.smtpSettings?.senderEmail || '',
        senderName: response.smtpSettings?.senderName || '',
        sslEnabled: Boolean(response.smtpSettings?.sslEnabled),
        alertsEnabled: Boolean(response.smtpSettings?.alertsEnabled),
        alertRecipientEmails: textList(response.smtpSettings?.alertRecipientEmails),
        ccEmails: textList(response.smtpSettings?.ccEmails),
        bccEmails: textList(response.smtpSettings?.bccEmails),
        hasPassword: Boolean(response.smtpSettings?.hasPassword),
      })

      setRulesForm({
        cpuUsageThreshold: Number(response.alertRules?.cpuUsageThreshold ?? 85),
        memoryUsageThreshold: Number(response.alertRules?.memoryUsageThreshold ?? 85),
        diskUsageThreshold: Number(response.alertRules?.diskUsageThreshold ?? 90),
        temperatureThreshold: Number(response.alertRules?.temperatureThreshold ?? 35),
        powerFailureAlertEnabled: Boolean(response.alertRules?.powerFailureAlertEnabled),
        vmAddedAlertEnabled: Boolean(response.alertRules?.vmAddedAlertEnabled),
        vmRemovedAlertEnabled: Boolean(response.alertRules?.vmRemovedAlertEnabled),
        vmPowerAlertEnabled: Boolean(response.alertRules?.vmPowerAlertEnabled),
        hostDownAlertEnabled: Boolean(response.alertRules?.hostDownAlertEnabled),
        rduAlertEnabled: Boolean(response.alertRules?.rduAlertEnabled),
        dashboardParameterChangeEnabled: Boolean(response.alertRules?.dashboardParameterChangeEnabled),
      })

      setLoading(false)
    }

    loadConfig()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSaveSmtp() {
    setSmtpSaving(true)
    try {
      await updateSmtpSettings({
        ...smtpForm,
        smtpPort: Number(smtpForm.smtpPort || 587),
        alertRecipientEmails: parseTextList(smtpForm.alertRecipientEmails),
        ccEmails: parseTextList(smtpForm.ccEmails),
        bccEmails: parseTextList(smtpForm.bccEmails),
      })
      setSmtpForm((current) => ({ ...current, smtpPassword: '', hasPassword: true }))
      pushToast('success', 'SMTP saved', 'Mail alert settings were saved successfully.')
    } catch (error) {
      pushToast('error', 'SMTP save failed', error.message)
    } finally {
      setSmtpSaving(false)
    }
  }

  async function handleSaveRules() {
    setRulesSaving(true)
    try {
      await updateAlertRules(rulesForm)
      pushToast('success', 'Rules saved', 'Alert rules were updated successfully.')
    } catch (error) {
      pushToast('error', 'Rules save failed', error.message)
    } finally {
      setRulesSaving(false)
    }
  }

  async function handleTestMail() {
    setTestingMail(true)
    try {
      await updateSmtpSettings({
        ...smtpForm,
        smtpPort: Number(smtpForm.smtpPort || 587),
        alertRecipientEmails: parseTextList(smtpForm.alertRecipientEmails),
        ccEmails: parseTextList(smtpForm.ccEmails),
        bccEmails: parseTextList(smtpForm.bccEmails),
      })
      setSmtpForm((current) => ({ ...current, smtpPassword: '', hasPassword: true }))
      await sendAlertTestEmail()
      pushToast('success', 'Test email sent', 'SMTP transport is working and the test email was dispatched.')
    } catch (error) {
      pushToast('error', 'Test email failed', error.message)
    } finally {
      setTestingMail(false)
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="mb-12 grid gap-6 xl:grid-cols-[1.2fr_1fr] items-start">
        <div className="flex flex-col gap-6 pr-2">
          <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Mail Alert & SMTP Settings</h2>
                <p className="mt-1 text-sm text-slate-500">Configure SMTP delivery, recipients, and alert transport controls.</p>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {loading ? 'Loading...' : 'Superadmin'}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">SMTP Host</span>
                <input value={smtpForm.smtpHost} onChange={(e) => setSmtpForm((c) => ({ ...c, smtpHost: e.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="smtp.office365.com" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">SMTP Port</span>
                <input type="number" value={smtpForm.smtpPort} onChange={(e) => setSmtpForm((c) => ({ ...c, smtpPort: e.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="587" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">SMTP Username</span>
                <input value={smtpForm.smtpUser} onChange={(e) => setSmtpForm((c) => ({ ...c, smtpUser: e.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="alerts@datacenter.com" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">SMTP Password</span>
                <input type="password" value={smtpForm.smtpPassword} onChange={(e) => setSmtpForm((c) => ({ ...c, smtpPassword: e.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder={smtpForm.hasPassword ? 'Saved password retained unless replaced' : 'Enter SMTP password'} />
                <span className="text-xs text-slate-500">
                  {smtpForm.hasPassword
                    ? 'Leave this blank to keep the saved password. Test mail will use the saved password automatically.'
                    : 'Enter the SMTP password once, save it, and future tests can reuse it.'}
                </span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">Sender Email</span>
                <input value={smtpForm.senderEmail} onChange={(e) => setSmtpForm((c) => ({ ...c, senderEmail: e.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="alerts@datacenter.com" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">Sender Name</span>
                <input value={smtpForm.senderName} onChange={(e) => setSmtpForm((c) => ({ ...c, senderName: e.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="Data Center Monitor" />
              </label>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="flex flex-col gap-2 lg:col-span-1">
                <span className="text-sm font-bold text-slate-700">Alert recipient emails</span>
                <textarea value={smtpForm.alertRecipientEmails} onChange={(e) => setSmtpForm((c) => ({ ...c, alertRecipientEmails: e.target.value }))} rows={5} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="ops@datacenter.com&#10;infra@datacenter.com" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">CC emails</span>
                <textarea value={smtpForm.ccEmails} onChange={(e) => setSmtpForm((c) => ({ ...c, ccEmails: e.target.value }))} rows={5} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="manager@datacenter.com" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-slate-700">BCC emails</span>
                <textarea value={smtpForm.bccEmails} onChange={(e) => setSmtpForm((c) => ({ ...c, bccEmails: e.target.value }))} rows={5} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" placeholder="audit@datacenter.com" />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ToggleField
                label="Enable SSL/TLS"
                description="Use secure SMTP transport for encrypted mail delivery."
                checked={smtpForm.sslEnabled}
                onChange={(value) => setSmtpForm((current) => ({ ...current, sslEnabled: value }))}
              />
              <ToggleField
                label="Enable Alerts"
                description="Master switch for automatic email alerts from the monitoring engine."
                checked={smtpForm.alertsEnabled}
                onChange={(value) => setSmtpForm((current) => ({ ...current, alertsEnabled: value }))}
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleTestMail}
                disabled={loading || testingMail}
                className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testingMail ? 'Sending Test Email...' : 'Send Test Email'}
              </button>
              <button
                type="button"
                onClick={handleSaveSmtp}
                disabled={loading || smtpSaving}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {smtpSaving ? 'Saving Configuration...' : 'Save Configuration'}
              </button>
            </div>
          </div>

          {children}
        </div>

        <div className="flex flex-col rounded-[30px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Alert Rules Configuration</h2>
            <p className="mt-1 text-sm text-slate-500">Tune thresholds and event categories that should trigger immediate mail alerts.</p>
          </div>

          <div className="space-y-4">
            <SliderField label="CPU Usage Threshold" value={rulesForm.cpuUsageThreshold} onChange={(value) => setRulesForm((current) => ({ ...current, cpuUsageThreshold: value }))} />
            <SliderField label="Memory Usage Threshold" value={rulesForm.memoryUsageThreshold} onChange={(value) => setRulesForm((current) => ({ ...current, memoryUsageThreshold: value }))} />
            <SliderField label="Disk Usage Threshold" value={rulesForm.diskUsageThreshold} onChange={(value) => setRulesForm((current) => ({ ...current, diskUsageThreshold: value }))} />
            <SliderField label="Temperature Threshold" value={rulesForm.temperatureThreshold} min={10} max={80} suffix=" C" onChange={(value) => setRulesForm((current) => ({ ...current, temperatureThreshold: value }))} />
          </div>

          <div className="mt-5 space-y-3">
            <ToggleField label="Power Failure Alert" description="Send alerts when the RDU reports power loss or UPS fallback." checked={rulesForm.powerFailureAlertEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, powerFailureAlertEnabled: value }))} />
            <ToggleField label="VM Added Alert" description="Notify when new VMs are discovered in inventory." checked={rulesForm.vmAddedAlertEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, vmAddedAlertEnabled: value }))} />
            <ToggleField label="VM Removed Alert" description="Notify when an existing VM disappears from inventory." checked={rulesForm.vmRemovedAlertEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, vmRemovedAlertEnabled: value }))} />
            <ToggleField label="VM Power On/Off Alert" description="Send alerts when any VM changes power state on any monitored host." checked={rulesForm.vmPowerAlertEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, vmPowerAlertEnabled: value }))} />
            <ToggleField label="Host Down Alert" description="Send immediate alerts when host connection or power state becomes unhealthy." checked={rulesForm.hostDownAlertEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, hostDownAlertEnabled: value }))} />
            <ToggleField label="RDU Alert" description="Send alerts for RDU door events, sensor failures, and abnormal rack conditions." checked={rulesForm.rduAlertEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, rduAlertEnabled: value }))} />
            <ToggleField label="Dashboard Parameter Change" description="Trigger alerts for significant spikes and monitored parameter changes." checked={rulesForm.dashboardParameterChangeEnabled} onChange={(value) => setRulesForm((current) => ({ ...current, dashboardParameterChangeEnabled: value }))} />
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={handleSaveRules}
              disabled={loading || rulesSaving}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rulesSaving ? 'Saving Rules...' : 'Save Alert Rules'}
            </button>
          </div>
        </div>
      </section>

    </>
  )
}
