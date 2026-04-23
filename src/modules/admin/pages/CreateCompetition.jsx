import React from 'react';
import { useNavigate } from 'react-router-dom';
import CompetitionForm from '../components/CompetitionForm';

const CreateCompetition = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8 fade-in">
        <h1 className="text-3xl font-serif font-bold mb-6">Create Competition</h1>
      </div>

      <CompetitionForm 
        onCancel={() => navigate('/admin/competitions')} 
        onSubmit={() => navigate('/admin/competitions')}
      />
    </div>
  );
};

export default CreateCompetition;
