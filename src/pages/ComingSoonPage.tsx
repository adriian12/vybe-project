const ComingSoonPage = () => (
  <div
    style={{ background: '#111114', minHeight: '100dvh' }}
    className="flex flex-col items-center justify-center px-6 text-center"
  >
    <div className="mb-8 select-none text-7xl font-black tracking-tight text-[#F8D000]" style={{ fontFamily: 'Outfit, sans-serif' }}>
      F
    </div>

    <h1
      className="mb-4 text-3xl font-extrabold text-white"
      style={{ fontFamily: 'Outfit, sans-serif' }}
    >
      Algo gordo está a punto de llegar...
    </h1>

    <p className="max-w-xs text-base text-[#A1A1A6]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      Fiestea abre pronto. Prepárate para vivir las noches de Mallorca de otra manera.
    </p>

    <div className="mt-10 h-1 w-16 rounded-full bg-[#F8D000]" />
  </div>
);

export default ComingSoonPage;
