function initScroll(chapters, onChapterChange) {
  const sections = document.querySelectorAll('#hero, .chapter');
  let activeId = null;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.target.id !== activeId) {
        activeId = entry.target.id;

        sections.forEach(s => s.classList.remove('active'));
        entry.target.classList.add('active');

        if (activeId === 'hero') {
          onChapterChange({ type: 'hero' });
        } else {
          const chapter = chapters.find(c => c.id === activeId);
          if (chapter) onChapterChange(chapter);
        }
      }
    });
  }, {
    threshold: 0.4
  });

  sections.forEach(s => observer.observe(s));
}
