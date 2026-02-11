import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, MessageCircle, Shield, Sparkles, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Card from '../../components/common/Card'
import SectionHeader from '../../components/common/SectionHeader'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { useAuthStore } from '../../stores/authStore'

interface PricingPlan {
  name: string
  price: string
  highlight?: boolean
  points: string[]
}

interface FaqItem {
  q: string
  a: string
}

type WelcomeView = 'overview' | 'features' | 'ecosystem' | 'pricing' | 'faq'

interface WelcomeViewTab {
  key: WelcomeView
  label: string
}

export default function Welcome() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { t } = useTranslation()
  const [activeView, setActiveView] = useState<WelcomeView>('overview')

  const features = [
    {
      icon: <MessageCircle className="h-6 w-6" />,
      title: t('welcome.features.smartDialogue.title'),
      description: t('welcome.features.smartDialogue.description'),
    },
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: t('welcome.features.visibleThinking.title'),
      description: t('welcome.features.visibleThinking.description'),
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: t('welcome.features.streamingOutput.title'),
      description: t('welcome.features.streamingOutput.description'),
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: t('welcome.features.secureReliable.title'),
      description: t('welcome.features.secureReliable.description'),
    },
  ]

  const integrations = t('welcome.integrations', { returnObjects: true }) as string[]
  const pricingPlans = t('welcome.pricing.plans', { returnObjects: true }) as PricingPlan[]
  const faqItems = t('welcome.faq.items', { returnObjects: true }) as FaqItem[]
  const trustPoints = t('welcome.trustPoints', { returnObjects: true }) as string[]

  const viewTabs = useMemo<WelcomeViewTab[]>(
    () => [
      { key: 'overview', label: t('welcome.views.overview') },
      { key: 'features', label: t('welcome.views.features') },
      { key: 'ecosystem', label: t('welcome.views.ecosystem') },
      { key: 'pricing', label: t('welcome.views.pricing') },
      { key: 'faq', label: t('welcome.views.faq') },
    ],
    [t]
  )

  const tabClassName = (isActive: boolean) =>
    [
      'rounded-full border px-3 py-1.5 text-xs font-ui transition-colors md:text-sm',
      isActive
        ? 'border-ink-black bg-ink-black text-paper-white'
        : 'border-line-soft bg-paper-white text-text-secondary hover:border-line-strong hover:text-text-primary',
    ].join(' ')

  const scrollToStage = () => {
    document.getElementById('main-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const renderOverviewView = () => (
    <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <div>
        <SectionHeader
          title={t('welcome.heroTitle')}
          subtitle={t('welcome.description')}
        />
        <div className="mt-5 space-y-2">
          {trustPoints.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm font-ui text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-cyan-ink" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line-soft bg-paper-white/85 p-4">
        <div className="rounded-md border border-line-soft bg-ink-dark px-4 py-2.5 text-paper-white">
          <p className="font-ui text-sm">{t('welcome.previewHeader')}</p>
        </div>
        <div className="mt-3 space-y-3 rounded-md bg-paper-cream/60 p-3">
          <div className="max-w-[90%] rounded-lg bg-paper-cream px-3 py-2 text-sm font-ui text-text-primary">
            {t('welcome.previewUser')}
          </div>
          <div className="ml-auto max-w-[90%] rounded-lg bg-ink-black px-3 py-2 text-sm font-ui text-paper-white">
            {t('welcome.previewAssistant')}
          </div>
          <div className="rounded-lg border border-line-soft bg-paper-white px-3 py-2 text-sm font-ui text-text-secondary">
            {t('welcome.previewThinking')}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-md border border-line-soft bg-paper-white px-2.5 py-1 text-xs font-ui text-text-secondary">
            {t('chat.quick.chat')}
          </span>
          <span className="rounded-md border border-line-soft bg-paper-white px-2.5 py-1 text-xs font-ui text-text-secondary">
            {t('chat.quick.draw')}
          </span>
          <span className="rounded-md border border-line-soft bg-paper-white px-2.5 py-1 text-xs font-ui text-text-secondary">
            {t('chat.quick.ppt')}
          </span>
        </div>
      </div>
    </div>
  )

  const renderFeaturesView = () => (
    <div>
      <SectionHeader
        title={t('welcome.sections.featuresTitle')}
        subtitle={t('welcome.sections.featuresSubtitle')}
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, idx) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
          >
            <Card className="h-full">
              <div className="mb-3 inline-flex rounded-md bg-paper-cream p-2 text-ink-black">{feature.icon}</div>
              <h3 className="text-xl font-title text-ink-black">{feature.title}</h3>
              <p className="mt-2 text-sm font-ui text-text-secondary">{feature.description}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )

  const renderEcosystemView = () => (
    <div className="space-y-6">
      <SectionHeader
        title={t('welcome.sections.integrationTitle')}
        subtitle={t('welcome.sections.integrationSubtitle')}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-xl font-title text-ink-black">{t('welcome.sections.trustTitle')}</h3>
          <p className="mt-2 text-sm font-ui text-text-secondary">{t('welcome.sections.trustSubtitle')}</p>
          <div className="mt-4 space-y-2">
            {trustPoints.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-ui text-text-secondary">
                <CheckCircle2 className="h-4 w-4 text-cyan-ink" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-xl font-title text-ink-black">{t('welcome.sections.integrationTitle')}</h3>
          <p className="mt-2 text-sm font-ui text-text-secondary">{t('welcome.sections.integrationSubtitle')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {integrations.map((item) => (
              <span
                key={item}
                className="rounded-md border border-line-soft bg-paper-white px-3 py-1.5 text-xs font-ui text-text-secondary"
              >
                {item}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )

  const renderPricingView = () => (
    <div>
      <SectionHeader
        align="center"
        title={t('welcome.sections.pricingTitle')}
        subtitle={t('welcome.sections.pricingSubtitle')}
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {pricingPlans.map((plan) => (
          <Card
            key={plan.name}
            className={`h-full ${plan.highlight ? 'border-vermilion shadow-ink' : ''}`}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-2xl font-title text-ink-black">{plan.name}</h3>
              {plan.highlight && (
                <span className="rounded-md bg-vermilion px-2 py-1 text-xs font-ui text-paper-white">
                  {t('welcome.pricing.recommended')}
                </span>
              )}
            </div>
            <p className="mt-3 text-3xl font-title text-ink-black">{plan.price}</p>
            <ul className="mt-4 space-y-2">
              {plan.points.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm font-ui text-text-secondary">
                  <CheckCircle2 className="h-4 w-4 text-cyan-ink" />
                  {point}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )

  const renderFaqView = () => (
    <div className="space-y-6">
      <SectionHeader
        align="center"
        title={t('welcome.sections.faqTitle')}
        subtitle={t('welcome.sections.faqSubtitle')}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {faqItems.map((item) => (
          <Card key={item.q}>
            <h4 className="text-lg font-title text-ink-black">{item.q}</h4>
            <p className="mt-2 text-sm font-ui text-text-secondary">{item.a}</p>
          </Card>
        ))}
      </div>
      <div className="rounded-lg border border-line-soft bg-paper-cream/60 p-4 text-center md:p-5">
        <p className="text-base font-title text-ink-black">{t('welcome.sections.ctaTitle')}</p>
        <p className="mt-1 text-sm font-ui text-text-secondary">{t('welcome.sections.ctaSubtitle')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          <Button onClick={() => navigate(isAuthenticated ? '/chat' : '/auth/register')}>
            {isAuthenticated ? t('welcome.startChat') : t('welcome.getStarted')}
          </Button>
          {!isAuthenticated && (
            <Button variant="outline" onClick={() => navigate('/auth/login')}>
              {t('common.login')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const renderStageContent = () => {
    if (activeView === 'overview') return renderOverviewView()
    if (activeView === 'features') return renderFeaturesView()
    if (activeView === 'ecosystem') return renderEcosystemView()
    if (activeView === 'pricing') return renderPricingView()
    return renderFaqView()
  }

  return (
    <div className="h-[100dvh] overflow-y-auto bg-canvas-gradient">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 lg:px-10">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-black text-paper-white">
              <span className="font-title text-xl">墨</span>
            </div>
            <div>
              <p className="text-2xl font-title text-ink-black">{t('welcome.brand')}</p>
              <p className="text-xs font-ui text-text-secondary">{t('welcome.slogan')}</p>
            </div>
          </div>

          <div className="hidden items-center gap-1 rounded-full border border-line-soft bg-paper-white/80 p-1 lg:flex">
            {viewTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveView(tab.key)}
                className={tabClassName(activeView === tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher position="inline" />
            {isAuthenticated ? (
              <Button onClick={() => navigate('/chat')}>{t('welcome.enterChat')}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => navigate('/auth/login')}>
                  {t('common.login')}
                </Button>
                <Button variant="seal" onClick={() => navigate('/auth/register')}>
                  {t('common.register')}
                </Button>
              </>
            )}
          </div>
        </nav>

        <section className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="mb-4 inline-flex items-center rounded-full border border-line-soft bg-paper-white/70 px-3 py-1 text-xs font-ui text-text-secondary">
              {t('welcome.heroBadge')}
            </p>
            <h1 className="font-title text-5xl leading-tight text-ink-black md:text-6xl lg:text-7xl">
              {t('welcome.heroTitle')}
            </h1>
            <p className="mt-4 max-w-2xl text-base font-ui leading-relaxed text-text-secondary md:text-lg">
              {t('welcome.description')}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate(isAuthenticated ? '/chat' : '/auth/register')}>
                {isAuthenticated ? t('welcome.startChat') : t('welcome.getStarted')}
              </Button>
              <Button size="lg" variant="outline" onClick={scrollToStage}>
                {t('welcome.learnMore')}
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <Card elevated className="overflow-hidden p-0">
              <div className="border-b border-line-soft bg-ink-dark px-4 py-3 text-paper-white">
                <p className="font-ui text-sm">{t('welcome.previewHeader')}</p>
              </div>
              <div className="space-y-3 bg-paper-white/80 p-4">
                <div className="max-w-[90%] rounded-lg bg-paper-cream px-3 py-2 text-sm font-ui text-text-primary">
                  {t('welcome.previewUser')}
                </div>
                <div className="ml-auto max-w-[90%] rounded-lg bg-ink-black px-3 py-2 text-sm font-ui text-paper-white">
                  {t('welcome.previewAssistant')}
                </div>
                <div className="rounded-lg border border-line-soft bg-paper-white px-3 py-2 text-sm font-ui text-text-secondary">
                  {t('welcome.previewThinking')}
                </div>
              </div>
            </Card>
          </motion.div>
        </section>

        <section id="main-stage" className="mt-14">
          <Card elevated className="overflow-hidden p-0">
            <div className="border-b border-line-soft bg-paper-white/80 px-4 py-3 md:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 rounded-full border border-line-soft bg-paper-white p-1">
                  {viewTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveView(tab.key)}
                      className={tabClassName(activeView === tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-ui text-text-muted">{t('welcome.views.switchHint')}</span>
              </div>
            </div>

            <div className="p-4 md:p-6 lg:p-8">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {renderStageContent()}
              </motion.div>
            </div>
          </Card>
        </section>

        <footer className="pb-4 pt-10 text-center text-xs font-ui text-text-muted">{t('welcome.footer')}</footer>
      </div>
    </div>
  )
}
