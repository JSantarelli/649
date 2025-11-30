  const openModalButton = document.getElementById('openModal');
  const closeModalButton = document.getElementById('closeModal');
  const modal = document.getElementById('myModal');
  const overlay = document.querySelector('.modal__overlay');
  const map = document.getElementById('map');

  if (openModalButton && closeModalButton && modal && overlay) {
    openModalButton.addEventListener('click', () => {
      modal.classList.add('modal--active');
      document.body.style.overflow = 'hidden';
      map.style.filter =  'blur(6px)';
    });
      closeModalButton.addEventListener('click', () => {
      modal.classList.remove('modal--active');
      document.body.style.overflow = '';
      map.style.filter =  '';
    });
      overlay.addEventListener('click', () => {
      modal.classList.remove('modal--active');
      document.body.style.overflow = '';  
      map.style.filter =  '';
    });
  }

  // Social JS
  const openShareModalButton = document.getElementById('openShareModal');
  const closeShareModalButton = document.getElementById('closeShareModal');
  const shareModal = document.getElementById('shareModal');
  const shareOverlay = shareModal?.querySelector('.modal__overlay');

  if (openShareModalButton && closeShareModalButton && shareModal && shareOverlay) {
    openShareModalButton.addEventListener('click', () => {
      shareModal.classList.add('modal--active');
      document.body.style.overflow = 'hidden';
      map.style.filter = 'blur(6px)';
    });

    closeShareModalButton.addEventListener('click', () => {
      shareModal.classList.remove('modal--active');
      document.body.style.overflow = '';
      map.style.filter = '';
    });

    shareOverlay.addEventListener('click', () => {
      shareModal.classList.remove('modal--active');
      document.body.style.overflow = '';
      map.style.filter = '';
    });
  }