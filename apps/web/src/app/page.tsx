export default function HomePage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
			<h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
				Next.js + Tailwind listo en apps/web
			</h1>
			<p className="text-base text-slate-600 sm:text-lg">
				Esta app está corriendo con App Router, Bun y Turborepo.
			</p>
			<span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-sm font-medium text-emerald-700">
				Configuración completada ✅
			</span>
		</main>
	)
}
