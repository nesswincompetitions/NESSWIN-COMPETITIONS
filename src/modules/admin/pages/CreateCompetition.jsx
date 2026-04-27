import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import CompetitionForm from '../components/CompetitionForm';

const CreateCompetition = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  return (
    <div className="max-w-7xl mx-auto pb-20">
      <div className="mb-8 fade-in">
        <button 
          onClick={() => navigate('/admin/competitions')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm mb-4 w-fit"
        >
          <ArrowLeft size={16} />
          {t('competitions.detail.backToCompetitions')}
        </button>
        <h1 className="text-3xl font-serif font-bold mb-6">{t('competitions.createTitle')}</h1>
      </div>

      <CompetitionForm
        onCancel={() => navigate('/admin/competitions')}
        onSubmit={() => navigate('/admin/competitions')}
      />
    </div>
  );
};

export default CreateCompetition;
